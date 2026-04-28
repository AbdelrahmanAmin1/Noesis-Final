# SOLID Principles

SOLID is an acronym for five design principles that, taken together, guide you toward code that is easier to extend, test, and refactor. They were popularized by Robert C. Martin. Treat them as heuristics, not laws.

## S — Single Responsibility Principle

> A class should have one, and only one, reason to change.

"Reason to change" means an *axis of variation* — a stakeholder, a regulation, a database engine, a UI layout. If your `Invoice` class formats PDFs *and* computes tax *and* stores rows in the database, three different changes in three different stakeholders all converge on the same file. Pull each responsibility into its own class:

- `InvoiceCalculator` — tax math.
- `InvoiceRenderer` — produces a PDF.
- `InvoiceRepository` — persists rows.

Now a tax-rule change touches one file, not three.

## O — Open/Closed Principle

> Software entities should be open for extension, but closed for modification.

You should be able to add new behavior without editing the classes that already work. Achieve this by depending on abstractions:

```java
interface DiscountPolicy { double apply(double total); }
class CartCheckout {
    private final DiscountPolicy policy;
    public CartCheckout(DiscountPolicy policy) { this.policy = policy; }
    public double finalize(double total) { return policy.apply(total); }
}
```

Adding a `BlackFridayPolicy` is a new class; `CartCheckout` is not edited. Without the interface, every new sale type requires another `if` branch in checkout — that is the smell OCP fights.

## L — Liskov Substitution Principle

> Subtypes must be substitutable for their base types without altering correctness.

The classic counterexample is `Square extends Rectangle`. Caller code says `r.setWidth(5); r.setHeight(10); assertEquals(50, r.area());` and the `Square` overrides both setters to keep sides equal — silently changing what the caller observed. The fix: do not inherit. A `Square` *is not* a `Rectangle` in the behavioral sense.

Practical test: if a subclass strengthens preconditions ("this method now requires non-null") or weakens postconditions ("returns null sometimes"), it violates LSP. Subclasses can only *relax* preconditions and *strengthen* postconditions.

## I — Interface Segregation Principle

> Clients should not be forced to depend on methods they do not use.

A `Worker` interface with `eat()`, `sleep()`, `code()`, `vacuum()` forces a `Robot` to implement methods that don't apply. Split into smaller interfaces — `Eater`, `Sleeper`, `Coder`, `Cleaner` — and let each class implement only the ones that matter. Same idea as SRP, applied to interfaces.

## D — Dependency Inversion Principle

> Depend on abstractions, not on concretions. High-level modules should not depend on low-level modules; both should depend on abstractions.

A high-level `OrderService` should not `new MySqlOrderRepo()` directly. Instead, `OrderService` depends on an `OrderRepository` interface and the concrete `MySqlOrderRepo` is *injected* (via constructor, factory, or DI container).

```java
class OrderService {
    private final OrderRepository repo;
    public OrderService(OrderRepository repo) { this.repo = repo; }
    public void place(Order o) { repo.save(o); }
}
```

Now you can swap to `PostgresOrderRepo`, `InMemoryOrderRepo` (for tests), or `HttpOrderRepo` (for a microservice migration) without touching `OrderService`. DIP is what makes everything else testable.

## How they compose

- **SRP** keeps classes small.
- **OCP** + **DIP** let you grow the system by adding files instead of editing them.
- **LSP** keeps polymorphism honest — substitution doesn't surprise.
- **ISP** keeps the contracts focused so SRP and DIP can do their job.

A useful internal motto: *new behavior arrives as a new file*. When you find yourself opening an existing class and adding an `if` branch for a new case, stop and ask whether SOLID would route that case into a new implementation of an existing interface instead.

## When to relax them

Premature SOLID is a real cost — every interface is a layer of indirection. For genuinely small projects, a single `Invoice` class is fine. Apply SOLID when you can name *who* will want to change *what* in the future, not preemptively for hypothetical needs.

## Heuristics

- One file you can describe in one sentence: probably SRP-clean.
- A class with five direct dependencies on concrete classes: likely violating DIP.
- An `enum` switch over types repeated in three places: likely violating OCP — replace with polymorphism.
- A subclass that throws `UnsupportedOperationException` on a parent method: LSP violation; the type hierarchy is wrong.
