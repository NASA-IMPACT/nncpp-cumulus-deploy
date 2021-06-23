import prompts from "prompts";
import * as R from "ramda";
import * as RulesAPI from "@cumulus/api-client/rules";
import Rules from '@cumulus/types/api/rules';

type UnfoldResult<I, O> = [O, I] | undefined | null | false;
type UnfoldFunction<I, O> = (input: I) =>
  UnfoldResult<I, O> | Promise<UnfoldResult<I, O>>;

/**
 * Returns an async generator that returns values from the specified unfolding
 * function.
 *
 * The specified function is initially invoked with the specified seed value as
 * the sole argument.  As soon as the function returns a falsy value, this
 * generator stops generating values.  Otherwise, the specified function is
 * expected to return a pair of values (2-element array).  In this case, this
 * generator yields the first item in the pair, then invokes the specified
 * function again, passing the second element in the pair to the function.
 *
 * @example
 * const f = (x) => x >= 0 && [x, x - 2];
 *
 * for await (const x of unfold(f, 10)) {
 *   console.log(x);
 * }
 *
 * //=> logs each of the values 10, 8, 6, 4, 2, 0
 *
 * @param f - a function that generates values until exhausted, returning either
 *    an array of 2 values when not exhausted (the first value is yielded by
 *    this generator and the second value is passed as the argument to the next
 *    call to this function parameter), or a falsy value when exausted
 * @param seed - the initial value passed to the specified function
 * @returns an async generator that yield values generated by the specified
 *    function while repeatedly invoking the function until exhausted
 */
async function* unfold<I, O>(f: UnfoldFunction<I, O>, seed: I) {
  for (
    let output: O, input: I, result = await f(seed);
    result && ([output, input] = result);
    result = await f(input)
  ) {
    yield output;
  }
}

/**
 * Returns an array of the items generated by the specified async iterable, in
 * the order produced by the iterable.
 *
 * @param asyncIterable - an async iterable to convert to an array; must be a
 *    finite iterable
 * @returns an array of the items generated by the specified async iterable, in
 *    the order produced by the iterable
 */
async function asyncToArray<T>(asyncIterable: AsyncIterable<T>): Promise<T[]> {
  const ts = [];
  for await (const t of asyncIterable) ts.push(t);
  return ts;
}

/**
 * Returns an asyncy generator function that will generate rules found in the
 * specified Cumulus stack based upon query parameters.
 *
 * @example
 * const query = { ... };
 * const findRules = createFindRules("myStack");
 * const rules = findRules(query);
 *
 * @param prefix - the Cumulus stack prefix
 * @returns an async generator function
 */
function createFindRules(prefix: string) {
  return async function* findRules(query: { [key: string]: string }) {
    async function findRulesByPage(page: number) {
      const pagedQuery = { ...query, page: `${page}` };
      const rules = await RulesAPI.listRules({ prefix, query: pagedQuery })
        .then(R.prop("body"))
        .then(JSON.parse)
        .then(R.tap(checkResponse))
        .then(R.prop<string, Rules.RuleRecord[]>("results"));

      return rules.length > 0 && [rules, page + 1] as [Rules.RuleRecord[], number];
    }

    for await (const pageOfRules of unfold(findRulesByPage, 1)) {
      yield* pageOfRules;
    }
  }
}

/**
 * Checks the response object of a Rules API query, throwing an error if no
 * `"results"` were returned.
 *
 * @param response - response object returned by a call to the Rules API
 * @throws an error if there is an error indicated in the response (consisting
 *    of the comma-separated concatenation of the `"reason"` properties of the
 *    array at the path `"meta.body.error.root_cause"`), or if no `"results"`
 *    property exists in the specified response
 */
function checkResponse(response: { [key: string]: Rules.RuleRecord[] }) {
  const reasons = R.map<any, string[]>(
    R.prop("reason"),
    R.pathOr([], ["meta", "body", "error", "root_cause"], response),
  );

  if (reasons.length > 0) throw new Error(reasons.join(", "));
  if (!R.prop("results", response)) throw new Error(
    `No 'results' in response: ${JSON.stringify(response)}`
  );
}

/**
 * Returns an object that can be used to query for rules with names that include
 * the specified string.
 *
 * @example
 * const findRules = createFindRules("myStack");
 * const fooRules = findRules(byNameIncludes("foo"));
 *
 * @param partialRuleName - the substring that a rule name must include in order
 *    for the rule to be returned by a rules list query
 * @returns an object that can be used to query for rules with names that
 *    include the specified string, and will also cause query results to be
 *    sorted in ascending order by rule name
 */
function byNameIncludes(partialRuleName?: string) {
  return {
    sort_by: "name",
    // TODO Look at Cumulus error caused when 'order' is included in query:
    // "No mapping found for [name.keyword] in order to sort on".  This error
    // surfaced only after upgrading Cumulus from 2.0.5 to 5.0.1
    //order: "asc",
    ...(partialRuleName ? { infix: partialRuleName } : {}),
  };
}

/**
 * Prompts the user the specified message to choose a rule from the specified
 * list of rules.
 *
 * @param message - the message to prompt the user with
 * @param rules - the list of rules for the user to choose (one) from
 * @returns a Promise that resolves to the name of the user's chosen rule, or
 *    `undefined` if there are no rules or the user canceled the prompt
 */
async function chooseRule(
  message: string,
  rules: Rules.RuleRecord[]
): Promise<string | undefined> {
  if (rules.length === 0) return;
  if (rules.length === 1) return rules[0].name;

  const { name } = await prompts({
    message,
    name: "name",
    type: "select",
    hint: "[Up/Down] Choose, [ESC] Cancel, [Enter] Submit",
    choices: rules.map((rule) => ({ title: rule.name, value: rule.name })),
  });

  return name;
}

/**
 * Runs the specified rule in the specified Cumulus stack.
 *
 * @param params - keyword parameters
 * @param params.prefix - Cumulus stack in which to run the specified rule
 * @param params.name - name of the rule to run
 * @returns the name of the rule that was run
 * @throws Error if the specified rule does not exist in the specified Cumulus
 *    stack, or if the request failed for some other reason
 */
async function runRule({ prefix, name }: { prefix: string, name: string }) {
  const updateParams = { name, action: "rerun" as "rerun" };
  const response = await RulesAPI.updateRule({ prefix, ruleName: name, updateParams });
  const { error = "", message = "" } = response.body ? JSON.parse(response.body) : {};

  if (error) throw new Error(message ?? error);

  return name;
}

async function main() {
  try {
    if (!process.env.CUMULUS_STACK) {
      throw new Error("Environment variable CUMULUS_STACK is not set.");
    }

    const prefix = process.env.CUMULUS_STACK;
    const partialRuleName = process.argv[2];
    const findRules = createFindRules(prefix);
    const rules = await asyncToArray(findRules(byNameIncludes(partialRuleName)));
    const onetimeRules = rules.filter((rule) => rule.rule.type === "onetime");
    const name = await chooseRule("Choose a rule:", onetimeRules);

    if (name) await runRule({ prefix, name });

    console.log(name ? `Rerunning rule '${name}'` : "No rule selected");
  } catch (e) {
    console.error(`ERROR: ${e.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
