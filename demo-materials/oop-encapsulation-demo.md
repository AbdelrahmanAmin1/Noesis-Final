# Encapsulation Demo Material

Encapsulation is an object-oriented programming principle where a class protects its internal data and exposes safe public methods.

## Core Idea

A class should keep fields private when outside code should not change them directly. Public methods provide controlled access.

Example:

```java
class BankAccount {
  private double balance;

  public BankAccount(double openingBalance) {
    if (openingBalance < 0) {
      throw new IllegalArgumentException("Opening balance cannot be negative");
    }
    balance = openingBalance;
  }

  public void deposit(double amount) {
    if (amount <= 0) {
      throw new IllegalArgumentException("Deposit must be positive");
    }
    balance += amount;
  }

  public double getBalance() {
    return balance;
  }
}
```

## Why It Matters

If `balance` were public, any code could set it to an invalid value such as `-500`. With encapsulation, the account controls how balance changes.

## Common Mistake

Using public fields or setters without validation breaks encapsulation because the object no longer protects its own rules.

## Checkpoint

Why is `private double balance` safer than `public double balance`?
