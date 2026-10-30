# Cross-language examples

These snippets show the same small domain boundary in different languages. They are examples,
not templates to paste blindly. Each language keeps its own idioms; the shared ideas are an
explicit repository port, constructor/composition-root injection, and a real failure path.

| Language | Example |
|---|---|
| TypeScript | `typescript/hexagonal-port.ts`, `typescript/domain-service.ts` |
| Go | `go/domain_service.go` |
| Python | `python/domain_service.py` |
| PHP | `php/DomainService.php` |
| Rust | `rust/domain_service.rs` |
| Java | `java/DeactivateUser.java` |
| Ruby | `ruby/domain_service.rb` |

The `code-examples` steering rule lists these files so an agent can load the examples relevant
to the project’s language. Add project-specific examples under `.orchid/steering/examples/` and
reference them from a project rule.
