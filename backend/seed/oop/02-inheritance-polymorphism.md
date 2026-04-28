# Inheritance and Polymorphism

## Inheritance

Inheritance is a relationship in which one class (the *subclass*) automatically receives the fields and methods of another (the *superclass*), and is then free to add to or override that behavior. The intent is to express an "is-a" relationship: a `Square` is a `Shape`; an `EmployeeAccount` is a `BankAccount`.

In Java the syntax is `class B extends A`. Constructors do not inherit; the subclass must call a superclass constructor with `super(...)`. Single inheritance is the rule for classes; multiple inheritance is allowed only for interfaces.

```java
public class Account {
    protected double balance;
    public void deposit(double a) { balance += a; }
}

public class SavingsAccount extends Account {
    private double rate;
    public SavingsAccount(double rate) { this.rate = rate; }
    public void accrueInterest() { balance += balance * rate; }
}
```

`SavingsAccount` already has a `balance` field and a `deposit` method without writing them again. It adds `accrueInterest`. A caller can treat a `SavingsAccount` anywhere an `Account` is expected.

## Method overriding

A subclass can replace a superclass method by re-declaring it with the same signature. The annotation `@Override` is not required but the compiler will catch typos when you use it.

```java
public class CheckingAccount extends Account {
    @Override
    public void deposit(double a) {
        if (a > 10000) audit(a);    // extra rule
        super.deposit(a);            // delegate to base
    }
}
```

`super.deposit(a)` reaches the parent implementation; without it, the child completely replaces the behavior.

## Polymorphism

*Polymorphism* — literally "many shapes" — is the property that a single reference type can dispatch to different runtime implementations.

```java
Account a = new SavingsAccount(0.04);
a.deposit(500);                 // statically: Account.deposit; runtime: same here
((SavingsAccount) a).accrueInterest();
```

The interesting case is *dynamic dispatch*:

```java
Account[] accounts = { new SavingsAccount(0.03), new CheckingAccount() };
for (Account a : accounts) a.deposit(100);   // each runs its own deposit
```

The compiler only knows the static type `Account`; the JVM picks the right `deposit` based on the actual object. This is the foundation that lets framework code call your code without knowing your class.

## "Is-a" vs "has-a"

Inheritance overuse is the most common OOP mistake. Before reaching for `extends`, ask: is this an *is-a* relationship, or a *has-a*? A `Car` *has* an `Engine`; it is not an `Engine`. Composition (`Car` holds an `Engine` field) almost always wins over inheritance because:

- The relationship is explicit in code (a field), not hidden in a class header.
- You can swap the engine at runtime; you cannot change a parent class.
- Refactors stay local — touching `Engine` does not break every `Car` subclass.

A useful test: if you cannot say "X is a Y" in plain English without flinching, do not inherit.

## Polymorphism without inheritance

Java offers polymorphism through *interfaces* too — and that path is usually preferable. An interface declares behavior, leaves implementation open, and avoids the "I inherited a giant base I do not want" trap.

```java
interface Discountable { double discount(); }
class Coupon implements Discountable { public double discount() { return 0.10; } }
class LoyaltyTier implements Discountable { public double discount() { return 0.05; } }

double total = base * (1 - someDiscount.discount());
```

Both `Coupon` and `LoyaltyTier` are `Discountable` without sharing storage or implementation. This is interface polymorphism.

## Liskov substitution (preview of SOLID)

If `S extends T`, anywhere a caller expects a `T`, a `S` must work without surprise. Concretely: a `Square extends Rectangle` looks fine until a caller does `r.setWidth(5); r.setHeight(10); assert r.area() == 50;` — and the `Square` silently fails. The fix is not to make `Square` inherit `Rectangle` at all.

## Pitfalls

- **Fragile base class.** Adding a method to the parent can break subclasses that already had a method with the same name (different intent).
- **Calling overridable methods from constructors.** During the parent's constructor, the subclass is not yet initialized. Calling a method the subclass overrides yields surprising NPEs.
- **Deep hierarchies.** More than two or three levels of inheritance is almost always a sign that you should refactor toward composition.

## Heuristics

- Default to composition. Use inheritance only when the subclass truly *is* the superclass.
- Prefer interfaces for polymorphism; reserve abstract classes for sharing implementation between close cousins.
- Mark methods `final` (or sealed) when subclasses must not override them — explicit intent.
