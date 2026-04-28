# Interfaces and Abstract Classes

## Interfaces

An interface is a contract: a list of method signatures with no implementation (or, in modern Java, with `default` methods that supply implementation but no state). A class that *implements* an interface promises that every listed method is available with the declared signature.

```java
public interface Comparable<T> {
    int compareTo(T other);
}

public class Money implements Comparable<Money> {
    private final long cents;
    public Money(long cents) { this.cents = cents; }
    public int compareTo(Money other) { return Long.compare(cents, other.cents); }
}
```

Interfaces enable polymorphism without inheritance: any code that needs "something I can compare" accepts a `Comparable<X>`, and you can pass a `Money`, a `Date`, a `String`, or anything else that implements it.

A class can implement many interfaces (`class Service implements Runnable, AutoCloseable, MetricsExporter`), but it can only `extend` one class. This is why interface-driven design scales while inheritance-driven design tangles.

## Abstract classes

An abstract class is a class that cannot be instantiated directly. It exists to share *partial* implementation with its subclasses and to declare some methods as `abstract` (no body), forcing subclasses to provide them.

```java
public abstract class Shape {
    protected final String name;
    protected Shape(String name) { this.name = name; }
    public String getName() { return name; }   // shared
    public abstract double area();             // each subclass supplies this
}

public class Circle extends Shape {
    private final double r;
    public Circle(double r) { super("Circle"); this.r = r; }
    public double area() { return Math.PI * r * r; }
}
```

Use abstract classes when subclasses share state (a stored `name`, a logger field, a connection pool) and behavior. Use interfaces when subclasses share only behavior signatures.

## Default methods (Java 8+)

Interfaces can supply method bodies via `default`. This added a third option: an interface that ships a behavior all implementers can use unless they override.

```java
interface Discountable {
    double price();
    default double discountedPrice(double pct) { return price() * (1 - pct); }
}
```

Default methods solve API-evolution problems: you can add a method to an interface without breaking every existing implementer. They do **not** add state. Use them when the default is genuinely useful and stateless.

## Choosing between them

| Need | Use |
|------|-----|
| Express a capability ("can be sorted", "can be closed") | interface |
| Multiple inheritance of *type* | interface |
| Share *implementation* + state across closely related classes | abstract class |
| Add behavior to an existing interface without breaking callers | `default` method on the interface |

A practical rule: prefer interfaces; reach for abstract classes only when you find yourself copy-pasting the same fields and helper methods into every implementer.

## Marker interfaces

An interface with no methods (e.g. `java.io.Serializable`) is a *marker* — its presence tags a class for special treatment by the runtime or framework. Modern designs prefer annotations for the same purpose, but markers still appear in the standard library.

## Sealed types (Java 17+)

You can `seal` a class or interface so only listed subclasses are allowed:

```java
public sealed interface Shape permits Circle, Square, Triangle {}
```

This is "closed polymorphism" — the compiler can prove a `switch` over a sealed type is exhaustive, which makes pattern matching safe and refactors clean. It's a useful middle ground between interfaces (open to anyone) and final classes (no extension).

## Pitfalls

- **Interface bloat.** A 30-method interface forces every implementer to drag along all 30. Split per the Interface Segregation Principle (see SOLID): clients shouldn't depend on methods they don't use.
- **Diamond confusion with default methods.** If a class implements two interfaces that supply the same `default` method, the compiler forces you to override and disambiguate. That is not a bug; it is the language asking you to be explicit.
- **Treating an abstract class as "an interface I can put fields in".** Sometimes that is exactly what you want — but it locks subclasses into a single inheritance chain. Verify that constraint is acceptable.

## Quick check

If a brand-new team adds a class that needs to participate in your system, would you rather they `implement YourInterface` (drop-in) or `extend YourBase` (locked into your hierarchy)? The first is almost always better. Bias your designs toward interfaces.
