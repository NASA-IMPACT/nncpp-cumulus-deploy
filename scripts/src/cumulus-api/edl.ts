import { Netrc } from "netrc-parser";
import { URL } from "url";
import axios, { AxiosInstance, AxiosRequestConfig } from "axios";
import compose from "ramda/src/compose";
import converge from "ramda/src/converge";
import equals from "ramda/src/equals";
import identity from "ramda/src/identity";
import join from "ramda/src/join";
import juxt from "ramda/src/juxt";
import objOf from "ramda/src/objOf";
import pipe from "ramda/src/pipe";
import prop from "lodash/fp/prop";
import set from "lodash/fp/set";

export type BasicCredentials = {
  username: string;
  password: string;
};

const apiOf = (baseURL: string) => axios.create({ ...noFollow(307), baseURL });
const redirectToEarthdataLogin = (api: AxiosInstance) => api.get("/token");
const requestToken = (tokenURL: string) => axios.create().get(tokenURL);
const toBase64 = (text: string) => Buffer.from(text).toString("base64");
const toBasicAuth = pipe(
  juxt<BasicCredentials[], any, any>([prop("username"), prop("password")]),
  join(":"),
  toBase64
);
const toURL = (url: string) => new URL(url);

/**
 * Returns the username and password associated with the specified host name
 * in the O/S-specific `netrc` file.
 *
 * @param file - `netrc` file to use (defaults to O/S-specific user file)
 * @returns a function that takes a host name as input and returns the username
 *    and password associated with the host name found within the specified
 *    `netrc` file
 * @throws if no username or password are found for the specified host name
 */
export const netrcCredentialsForHost = (file?: string) => (host: string) => {
  const netrc = new Netrc(file);
  const machine = (netrc.loadSync(), netrc.machines[host]);
  const { login: username, password } = machine ?? {};

  if (!username || !password) {
    throw new Error(`Missing credentials for '${host}' in '${netrc.file}'.`);
  }

  return { username, password };
};

/**
 * Returns an `AxiosRequestConfig` that prevents requests from following
 * redirects, and allows requests to succeed only for responses with the
 * specified status code (all others will throw an exception).
 *
 * Convenience function for succinctly specifying request configuration.
 * For example: `axios.create(noFollow(302))`.
 *
 * @param {number} status - expected response status code; any other response
 *    status code will be considered invalid, causing the request to throw an
 *    exception
 * @returns {AxiosRequestConfig} that prevents requests from following
 *    redirects, and allows requests to succeed only for responses with the
 *    specified status code (all others will throw an exception)
 */
const noFollow = (status: number): AxiosRequestConfig => ({
  maxRedirects: 0,
  validateStatus: equals(status)
});

/**
 * Axios HTTP request interceptor that adds Bearer token authorization to
 * each request.
 *
 * Uses the supplied function (optional) for obtaining appropriate credentials
 * (username and password) for the host to which requests are made.  The
 * function should throw an exception to indicate a failure to find appropriate
 * credentials.  When no credentials function is supplied, behavior defaults to
 * looking for credentials in the user's O/S-specific `netrc` file.
 *
 * Upon successfully obtaining credentials via the supplied (or default)
 * function, uses the credentials to obtain an access token to add as a Bearer
 * token in the Authorization header of each request.
 *
 * The following is a typical (default) usage example, where the BASE URL might
 * be obtained from the environment, and the appropriate credentials are
 * obtained from the user's O/S-specific `netrc` file:
 *
 * ```
 * import axios from "axios";
 * import { authorizer } from "./path/to/edl";
 *
 * const baseURL = "<BASE URL>";
 * const api = axios.create({ baseURL });
 *
 * api.interceptors.request.use(authorizer());
 *
 * ...
 *
 * // All requests are now automatically authorized
 * // by the request interceptor registered above.
 * const response = await api.get("/path/to/resource");
 * const resource = response.data;
 * ```
 *
 * IMPLEMENTATION NOTE: Once an access token is obtained, it is cached and
 * reused for all subsequent requests.  This means that once the token expires,
 * all subsequent requests will fail as unauthorized.
 *
 * @param credentialsForHost - function that retrieves the username and
 *    password for a specified host name (defaults to a function that retrieves
 *    credentials from the current user's O/S-specific `netrc` file)
 * @returns request interceptor that adds an Authorization header to each
 *    request by obtaining an access token using the specified
 *    credential-fetching function to retrieve the appropriate username and
 *    password for the request's target host name
 */
export const authorizer = (
  credentialsForHost: (
    hostname: string
  ) => BasicCredentials = netrcCredentialsForHost()
): ((config: AxiosRequestConfig) => Promise<AxiosRequestConfig>) => {
  let token: string | undefined;

  return async (config: AxiosRequestConfig) => {
    if (!token && config.baseURL) {
      const { baseURL } = config;
      const { origin } = new URL(baseURL);
      const credsForUrl = compose(credentialsForHost, prop("hostname"), toURL);
      const toLoginFormData = compose(objOf("credentials"), toBasicAuth);
      const loginFormDataForUrl = compose(toLoginFormData, credsForUrl);
      const loginConfig = { ...noFollow(302), headers: { origin } };
      const postFormData = (url: string, formData: any) =>
        axios.create(loginConfig).post(url, formData);
      const login = converge(postFormData, [identity, loginFormDataForUrl]);

      token = await redirectToEarthdataLogin(apiOf(baseURL))
        .then(compose(login, prop("headers.location")))
        .then(compose(requestToken, prop("headers.location")))
        .then(prop("data.message.token"));
    }

    return set("headers.Authorization", `Bearer ${token}`, config);
  };
};
