# Design Patterns — Introduction

Design patterns are *named* solutions to recurring object-oriented design problems. They are not rules to apply universally; they are vocabulary you use when you recognize a shape in your design. The seminal catalogue is the "Gang of Four" book (1994), which grouped 23 patterns into three families: **creational**, **structural**, and **behavioral**.

This file covers the handful you will see most often in real codebases.

## Creational

### Factory Method

A method whose job is to construct objects, returning an interface or abstract type. The caller does not say `new`; the factory decides which concrete class to build.

```java
interface Notification { void send(String msg); }
class SmsNotification implements Notification { public void send(String m) { ... } }
class EmailNotification implements Notification { public void send(String m) { ... } }

class NotificationFactory {
    static Notification create(String channel) {
        return switch (channel) {
            case "sms"   -> new SmsNotification();
            case "email" -> new EmailNotification();
            default      -> throw new IllegalArgumentException(channel);
        };
    }
}
```

Use when the choice of class depends on configuration or runtime data, and you want to keep that decision in one place.

### Builder

A fluent, step-by-step way to construct objects with many optional parameters. The alternative — a constructor with twelve arguments — is unreadable and error-prone.

```java
HttpRequest req = HttpRequest.newBuilder()
    .uri(URI.create("https://api.example.com"))
    .header("Accept", "application/json")
    .timeout(Duration.ofSeconds(5))
    .GET()
    .build();
```

Builders shine for immutable objects: each `with...` returns a new builder; `build()` produces the final object.

### Singleton

A class with exactly one instance, accessible globally. Useful for things that genuinely should be unique (a logger, a connection pool). Often abused as "global state with extra steps". If you reach for a singleton, ask whether dependency injection would serve you better.

## Structural

### Adapter

Wraps one interface so it looks like another. Common when integrating a third-party API into your domain.

```java
class StripeChargeAdapter implements PaymentGateway {
    private final StripeApi api;
    public PaymentResult charge(Money amount, Card card) {
        var stripeResponse = api.createCharge(amount.cents(), card.token());
        return PaymentResult.from(stripeResponse);
    }
}
```

Your code talks to `PaymentGateway`. Stripe stays inside the adapter. Replacing Stripe with Adyen later is a one-class change.

### Decorator

Wraps an object to add behavior without subclassing. Each decorator implements the same interface as what it wraps and delegates after (or before) doing its bit.

```java
Reader r = new BufferedReader(new InputStreamReader(new FileInputStream("a.txt")));
```

`FileInputStream` reads bytes; `InputStreamReader` adds character decoding; `BufferedReader` adds buffering. Each adds one capability. The pattern composes well, because decorators stack.

### Facade

A single, simplified entry point in front of a complex subsystem. Your `OrderProcessor.place(order)` may internally orchestrate inventory checks, payment, fulfillment, and notifications. The facade hides that machinery from callers.

## Behavioral

### Strategy

Encapsulate an algorithm behind an interface so the choice can vary at runtime. This is the textbook fix for "a long `if/else` over an enum of types".

```java
interface SortStrategy { <T> List<T> sort(List<T> in); }
class QuickSort implements SortStrategy { ... }
class MergeSort implements SortStrategy { ... }

class Sorter {
    private SortStrategy strategy;
    public void setStrategy(SortStrategy s) { this.strategy = s; }
    public <T> List<T> run(List<T> in) { return strategy.sort(in); }
}
```

Strategy is the operational form of the Open/Closed Principle.

### Observer

Many listeners (observers) subscribe to a subject; when the subject changes state, it notifies them all. The Java standard library uses it (`PropertyChangeListener`); modern frameworks prefer reactive streams (`Flow`, `Observable`) which are observer at scale.

### Command

Wrap a request as an object, so it can be queued, logged, undone, or sent across a wire. Useful in GUIs (undo/redo), job queues, and CQRS systems.

```java
interface Command { void execute(); }
class TransferMoney implements Command { ... }
queue.add(new TransferMoney(...));
```

### Template Method

A superclass defines the skeleton of an algorithm and leaves "the holes" abstract for subclasses to fill in. Common in frameworks: you `extend HttpServlet`, override `doGet`/`doPost`; the framework calls them in the right order.

## Heuristics on patterns

- **Patterns are vocabulary, not blueprints.** Use the name when it accurately describes what you wrote, so other engineers can find it quickly.
- **Recognize, then apply.** Don't open a project and ask "where can I put a Visitor?" Wait until the problem appears, then reach for the matching pattern.
- **Many "patterns" are just polymorphism.** Strategy and State share the same shape. Adapter and Facade both wrap things. Don't overload the catalog; overload your understanding of polymorphism.

## When patterns hurt

- **Pattern-itis.** Wrapping a 5-line script in a Builder, a Strategy, an Observer, and a Factory adds 200 lines and zero value.
- **Indirection cost.** Every interface costs the reader a hop. Use it when the variation it protects against is real, not theoretical.
- **Modern features replace patterns.** Lambdas often replace Strategy. Records often replace Builder for small immutable data. Sealed types often replace Visitor for closed hierarchies.
