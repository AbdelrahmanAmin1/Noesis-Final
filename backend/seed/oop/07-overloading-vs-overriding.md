# Method Overloading vs Method Overriding

Overloading and overriding are two forms of polymorphism. They look similar but serve different purposes and are resolved at different times.

## Method Overloading

Method overloading means defining multiple methods in the same class with the same name but different parameter lists. The compiler selects the correct version based on the number, types, and order of the arguments at compile time.

Overloading is compile-time polymorphism (also called static polymorphism or ad-hoc polymorphism). The method signature — name plus parameter types — must be unique within the class. Return type alone is not enough to distinguish overloaded methods in most languages.

## Method Overriding

Method overriding means a subclass provides its own implementation of a method already defined in its parent class. The overriding method must have the same name, return type, and parameter list. The correct version is selected at runtime based on the actual object type, not the reference type.

Overriding is runtime polymorphism (also called dynamic polymorphism or subtype polymorphism). In Java, a method must not be declared `final` or `static` to be overridable. In C++, the parent must declare the method `virtual`.

## Key Differences

Overloading happens within one class; overriding happens across a parent-child hierarchy. Overloading is resolved at compile time; overriding is resolved at runtime. Overloading changes the parameter list; overriding keeps the exact same signature.

## Common Mistakes

Changing only the return type and believing it creates an overload — most compilers reject this. Forgetting the `@Override` annotation in Java, which means a typo silently creates a new method instead of overriding. Confusing static method hiding with true overriding — static methods are resolved by reference type, not object type.

## When to Use Each

Use overloading when you want the same conceptual operation to accept different input shapes (e.g., `draw(Circle)` and `draw(Rectangle)`). Use overriding when a subclass needs to customize behavior defined by its parent while keeping the same interface.

## Complexity

Both overloading and overriding add no runtime cost beyond normal method dispatch. Virtual method tables used for overriding add one pointer indirection per call, which is O(1).
