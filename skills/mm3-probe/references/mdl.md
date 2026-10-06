# mdl in about 70 tokens

`mdl:` never reaches the classifier — it's free context the ledger learns from. Every field is optional: fill what you know, omit what doesn't apply. `why`/`area`/`stage`/`change`/`risk`/`blast` are closed lists — for this project's actual allowed values, run `mm3 agent mdl` (they're config-driven, so they're never hard-coded here). Two fields carry more than a bare value:

- `problem` — one line: what you're actually solving right now.
- `uses` — up to 5 chains describing what this run touches, in the C4 model (c4model.com): five levels, each inside the one above.

  ```
  system: shop
  └── container: web-app                      an app or data store
  │   ├── component: orders-handler           a group of code inside a container
  │   │   └── code: createOrder               your own function (not a built-in)
  │   └── component: orders-dao
  └── container: database
  person: customer                             outside the system
  system: payment-service                      an outside service is its own system
  ```

  Write it flat: `/` for "inside" (`component:web-app/orders-handler`), `->` for "uses" (`a -> b -> c`), `?` on any part for "guessed or not built yet" (`component:web-app/refunds?`, `system:email-service?`). Grammar: `chain := part (" -> " part)*`, `part := level ":" name ("/" name)* ["?"]`, `level := person | system | container | component | code`, `name` = lowercase kebab-case (or a code identifier at the code level).

Plus:

- `touches` — up to 5 domain objects/fields this run is about (not concepts like "authentication", not language built-ins).
- `blast` — the widest level one failure reaches (`person` = users' data or accounts, not "everyone").

Example, on a run fixing an injection flaw in a user-lookup handler:

```yaml
mdl:
  why: validate
  problem: Removing the SQL injection in findUser flagged by an earlier scan
  uses:
    - person:customer -> container:web-app
    - component:web-app/user-handler -> code:findUser -> container:db
  touches: [userId, findUser]
  blast: component
```
