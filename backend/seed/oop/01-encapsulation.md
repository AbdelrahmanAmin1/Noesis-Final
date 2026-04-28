# Encapsulation

## What it is

Encapsulation is the practice of bundling state (fields) and the behavior that operates on that state (methods) into a single unit — a class — and deliberately controlling what the outside world is allowed to see or change. It is the first of the four "pillars" of object-oriented programming, and the one the other three depend on.

The mechanical part of encapsulation is access control: keywords like `private`, `protected`, and `public` (Java/C#) or naming conventions and properties (Python). The conceptual part is harder: deciding *what* should be hidden, and *why*.

## The two ideas inside encapsulation

1. **Bundling.** A `BankAccount` keeps its `balance` and the rules for changing it (`deposit`, `withdraw`) in one place. Code that wants to mutate the balance must go through the methods, not poke the field.
2. **Information hiding.** Callers should depend on what the class promises to do, not on how it stores data. If you change the internal representation of `BankAccount` from a `double` to a `BigDecimal`, callers shouldn't notice.

## Why it matters

Without encapsulation, every external caller is coupled to your data layout. Renaming a field or changing how interest is computed becomes a cross-cutting refactor. With it, the public surface stays stable while the implementation evolves freely.

A second, less obvious benefit: enforcement of invariants. A `Date` class can guarantee that `month ∈ [1..12]` because it owns the constructor and the setter. A struct of public fields cannot.

## Java example

```java
public class BankAccount {
    private double balance;          // hidden state
    private final String owner;

    public BankAccount(String owner) {
        this.owner = owner;
        this.balance = 0.0;
    }

    public void deposit(double amount) {
        if (amount <= 0) throw new IllegalArgumentException("non-positive deposit");
        balance += amount;
    }

    public boolean withdraw(double amount) {
        if (amount <= 0 || amount > balance) return false;
        balance -= amount;
        return true;
    }

    public double getBalance() { return balance; }   // controlled read
}
```

The fields are `private`. The constructor is the only path to a valid initial state. `deposit` and `withdraw` enforce the "balance is non-negative" invariant. `getBalance` exposes the value but not the storage.

## Common mistakes

- **Getter/setter for every field.** This is the anti-pattern people reach for when they hear "encapsulation". A `setBalance(double)` undoes the whole point — you've just renamed `public double balance`. Setters belong only when there is *no domain rule* attached to the change.
- **Returning mutable internals.** `public List<Transaction> getTransactions()` lets callers `add()` directly to your list. Return `Collections.unmodifiableList(...)` or a defensive copy.
- **God objects.** Encapsulation does not mean "put everything in one class". Each class should encapsulate one thing well; multiple small classes that hide their own state compose better than one giant class hiding many things.

## Encapsulation vs abstraction

These two get confused often. Abstraction asks *what should this thing do?* and produces an interface. Encapsulation asks *how do I keep the implementation invisible?* and produces a class with hidden state. Abstraction is "what"; encapsulation is "how".

## Heuristics

- If a field has any rule attached ("must be positive", "is derived from another field"), it must not be public.
- If you find yourself reading the same field through a getter and immediately writing it back through a setter, the operation belongs *inside* the class as a method.
- If a refactor requires you to change every caller of `someClass.x`, your class wasn't encapsulated.

## Quick check

A `Rectangle` class stores width and height. Where does the rule "area = width * height" live? In the `Rectangle.area()` method, not at the call site. That is encapsulation in one sentence: the data and the rules about the data live together.
