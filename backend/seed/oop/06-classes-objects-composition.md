# Classes, Objects, and Composition

A class defines a type: the data an object stores and the behavior it exposes. An object is a runtime instance of a class with its own identity and state. Good object-oriented design keeps state changes intentional and exposes behavior through clear methods.

## Classes and Objects

Classes describe structure and behavior. Objects carry concrete values. For example, a `Stack` class might define `push`, `pop`, and `peek`, while each stack object stores its own elements.

## Abstraction

Abstraction hides unnecessary details behind a simpler interface. A caller should know what an operation does, not every internal step used to do it. This reduces coupling and makes code easier to change.

## Encapsulation

Encapsulation protects an object's invariants by keeping internal data private or carefully controlled. Instead of allowing any code to mutate fields directly, the object exposes methods that validate and coordinate state changes.

## Composition

Composition builds behavior by placing objects inside other objects. A class can delegate part of its work to another class rather than inheriting from it. Composition often creates more flexible designs than inheritance because components can be swapped or reused independently.

## Inheritance vs Composition

Use inheritance for a true is-a relationship where subclasses can honor the parent contract. Use composition for has-a relationships or when behavior should vary independently. A `Car` has an `Engine`, so composition is usually better than making `Car` inherit from `Engine`.

## Design Guideline

Prefer small classes with clear responsibilities. If a class knows too much, changes too often, or coordinates unrelated tasks, it may need to be split into collaborators.

