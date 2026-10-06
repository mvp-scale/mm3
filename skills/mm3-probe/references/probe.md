# A good/bad pair per family

One bad probe (an opinion with no mechanism, role, or place to check) and one good category (3 probes, one per role) for each family. Examples are NodeGoat-neutral: any small Node/Express handler shape works the same way. `family:` is shown explicitly only where the category name wouldn't auto-match it.

## Contents

- injection: reach · guard · sink
- access: actor · check · resource
- secrets: store · transport · exposure
- input: source · validate · reject
- output: source · encode · render
- availability: trigger · limit · recovery
- correctness: input · rule · result
- design: responsibility · dependency · testability
- design-risk: abuse · failure · data
- done: concrete · testable · owned
- other: no fixed roles

## injection — reach · guard · sink

Bad: "Is this method secure?"

```yaml
lookup:
  family: injection
  pass: no
  1: Is `id` taken from `req.query` and passed to `findUser` without validation?     # reach
  2: Is `id` bound as a parameterized argument instead of concatenated into the query string?  # guard (flipped polarity)
  3: Does `findUser` run the query with `db.query` on that string?                   # sink
```

## access — actor · check · resource

Bad: "Does this endpoint have access control?"

```yaml
ownership:
  family: access
  pass: no
  1: Is the session's own user id used to look up the record, not one taken from the request?   # actor
  2: Is the record's owner compared against the caller before it's returned?                     # check
  3: Could a caller read another user's record by changing the id alone?                         # resource
```

## secrets — store · transport · exposure

Bad: "Are secrets handled safely here?"

```yaml
apikey:
  family: secrets
  pass: no
  1: Is the API key read from an environment variable rather than hardcoded in `src/config.ts`?  # store (flipped polarity)
  2: Could the key be sent in a URL query string instead of a header?                             # transport
  3: Could the key appear in a client-visible error message or log line?                          # exposure
```

## input — source · validate · reject

Bad: "Is user input validated?"

```yaml
amount:
  family: input
  pass: no
  1: Is `amount` taken directly from the request body?                          # source
  2: Does the handler skip checking that `amount` is a positive number?          # validate
  3: Does the handler proceed to charge even when that check fails?              # reject (flipped polarity)
```

## output — source · encode · render

Bad: "Is the output safe?"

```yaml
profile:
  family: output
  pass: no
  1: Does the response body include the full database row for `user`?           # source
  2: Is `user.name` written into the page without HTML-escaping?                # encode
  3: Is `user.name` rendered inside a `<script>` context rather than plain HTML? # render
```

## availability — trigger · limit · recovery

Bad: "Could this endpoint go down?"

```yaml
bulklookup:
  family: availability
  pass: no
  1: Can a single request send an unbounded `ids` array to this handler?        # trigger
  2: Is the size of `ids` left uncapped before the handler processes it?        # limit
  3: Does a slow downstream call have no timeout, so the request hangs instead of failing fast?  # recovery
```

## correctness — input · rule · result

Bad: "Is the logic correct?"

```yaml
discount:
  family: correctness
  pass: yes
  1: Does `calculateTotal` receive the price before any discount is applied?     # input
  2: Does the discount rule match the spec (10% over 100 USD, not 100 USD inclusive)?  # rule
  3: Does the function return the same total for the same inputs on repeat calls? # result
```

## design — responsibility · dependency · testability

Bad: "Is this well designed?"

```yaml
boundaries:
  family: design
  pass: yes
  1: Does `UserService` own only user data, not billing?                        # responsibility
  2: Does `UserService` depend on `BillingService` through an interface, not a concrete import?  # dependency
  3: Can `UserService` be tested without a live database connection?            # testability
```

## design-risk — abuse · failure · data

Bad: "Is this risky?"

```yaml
exposure-risk:
  family: design-risk
  pass: no
  1: Could a caller repeatedly hit this endpoint to enumerate valid user ids?    # abuse
  2: Does the service hang rather than degrade when the downstream API is unavailable?  # failure
  3: Does this design store more personal data than the feature actually needs?  # data
```

## done — concrete · testable · owned

Bad: "Is this finished?"

```yaml
done:
  family: done
  pass: yes
  1: Is "guest checkout" scoped to one specific flow, not the whole redesign?    # concrete
  2: Does "guest checkout" have a written acceptance check it can be verified against?  # testable
  3: Does "guest checkout" have one named owner?                                # owned
```

## other — no fixed roles

Bad: "Is this fine?"

`other` is the escape hatch for a concern that doesn't fit the ten families above. There's no fixed role table — still write three distinct, observable probes, and pick your own three role names (as comments) so a reader can see they're not paraphrases of each other. Reach for one of the ten families first; only fall back to `other` when the concern genuinely doesn't fit any of them.
