import { authorizer, netrcCredentialsForHost } from "./edl";
import { Netrc } from "netrc-parser";
import assert from "assert";
import axios from "axios";
import fs from "fs";
import nock from "nock";
import os from "os";
import path from "path";
import prop from "lodash/fp/prop";

describe("Earthdata Login Authorizor", () => {
  const host = "testhost";
  const baseURL = `https://${host}/dev`;
  const api = axios.create({ baseURL });
  const token = "of my affection";

  beforeEach(() => {
    // Mock the request flow for obtaining an access token
    nock(baseURL)
      .get("/token")
      .reply(307, {}, { location: `${baseURL}/authorize` })
      .post("/authorize")
      .reply(302, {}, { location: `${baseURL}/token` })
      .get("/token")
      .reply(200, { message: { token } })
      .get(/collections/)
      .reply(200);
  });

  it("should add Authorization header with Bearer token", async () => {
    // Create temporary netrc file and insert dummy credentials for the
    // test host so that fetching credentials succeeds and a dummy token
    // is added to the Authorization header.

    const netrcFile = path.join(os.tmpdir(), ".netrc");
    const netrc = new Netrc(netrcFile);

    netrc.loadSync();
    netrc.machines[host] = { login: "tester", password: "secret" };
    netrc.saveSync();

    const interceptor = authorizer(netrcCredentialsForHost(netrcFile));
    const id = api.interceptors.request.use(interceptor);

    await api
      .get("/collections/foo/1")
      .then(prop("config.headers.Authorization"))
      .then(auth => assert.equal(auth, `Bearer ${token}`))
      .finally(() => {
        api.interceptors.request.eject(id);
        fs.unlinkSync(netrcFile);
      });
  });

  it("should reject when missing credentials for host", () => {
    const id = api.interceptors.request.use(authorizer());

    assert
      .rejects(api.get("/collections/foo/1"), /Missing credentials/)
      .finally(() => api.interceptors.request.eject(id));
  });
});
