# UML Class Relationships

UML class diagrams show the static structure of a system: which classes exist, what they contain, and how they relate. Understanding the six main relationships is essential for communicating design decisions.

## Association

An association is the most general relationship. It means one class uses or knows about another. Drawn as a plain line between two classes. Example: a `Student` is associated with a `Course`.

## Aggregation

Aggregation is a special association that represents a whole-part relationship where the part can exist independently of the whole. Drawn as a line with an open diamond at the whole end. Example: a `Department` aggregates `Professor` objects, but professors exist independently.

## Composition

Composition is a stronger whole-part relationship where the part cannot exist without the whole. Drawn as a line with a filled diamond at the whole end. Example: a `House` is composed of `Room` objects — if the house is destroyed, the rooms cease to exist.

## Inheritance (Generalization)

Inheritance represents an is-a relationship. A subclass inherits the attributes and methods of its parent. Drawn as a line with a hollow triangle arrowhead pointing to the parent. Example: `Dog` inherits from `Animal`.

## Realization (Interface Implementation)

Realization means a class implements the operations specified by an interface. Drawn as a dashed line with a hollow triangle arrowhead pointing to the interface. Example: `ArrayList` realizes the `List` interface.

## Dependency

Dependency means one class temporarily uses another, typically as a method parameter, local variable, or return type. Drawn as a dashed arrow. It is the weakest relationship. Example: a `ReportGenerator` depends on a `Formatter` it receives as a parameter.

## Multiplicity

Multiplicity annotations on association ends show how many instances participate: `1` (exactly one), `0..1` (zero or one), `*` or `0..*` (zero or more), `1..*` (one or more). Example: one `Order` has `1..*` `LineItem` objects.

## Common Mistakes

Confusing aggregation and composition — ask whether the part survives if the whole is deleted. Using inheritance when composition would be more flexible. Drawing dependencies as associations, which overstates the coupling.

## Design Guidelines

Favor composition over inheritance when behavior should vary independently. Use interfaces to define contracts and reduce coupling. Keep diagrams focused: show only the classes and relationships relevant to the design decision being communicated.
