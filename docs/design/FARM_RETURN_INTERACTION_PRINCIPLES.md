# Farm Return Interaction Principles

Farm Return should feel calm, direct and physical without imitating Apple visually. These principles borrow from Apple interaction design and Emil Kowalski's motion/interaction thinking, while keeping Farm Return's own agricultural, editorial visual language.

## Core rules

### 1. Object before form
The farmer should act on the real farm object first: a field, cattle group, shed, slurry store, input requirement or job. Forms are secondary editing states, not the default interface.

### 2. Show state before controls
Open on the current answer: where cattle are, what they weigh, the current target, what feeding is recommended. Only reveal inputs when the farmer chooses to change that state.

### 3. Progressive disclosure
Show the answer first, supporting detail second, maths/evidence third. Unknowns and warnings remain visible; complexity moves one interaction away, not out of sight.

### 4. Motion explains change
Motion must make a state change easier to follow. Expansion should visually originate from the row or object that triggered it. Avoid decorative animation.

### 5. Short, responsive transitions
Use roughly 180–320 ms transitions with a spring-like easing. Interactions should feel immediate and interruptible, never like a sequence the farmer must wait through.

### 6. Preserve spatial continuity
The selected object stays visually connected to the detail it reveals. Avoid jumping the user to unrelated panels or opening detached forms where inline expansion is clearer.

### 7. Restrained depth
Use elevation, blur, scale and shadow only to show which surface is active. Farm Return should remain quiet and functional, not glossy.

### 8. One primary action per context
A location state exposes movement. A production state exposes target editing. A feeding state exposes its plan or market action. Avoid global action toolbars with unrelated commands.

### 9. Inputs are editing states
Inputs should not dominate the normal view. Entering edit mode is deliberate; saving returns the user to a clean read state.

### 10. Data ownership comes before UI convenience
Never create a second editable representation of the same fact. Each fact has one authoritative owner and other screens read from it.

### 11. Touch first
Interactive surfaces need generous tap targets, visible focus states and layouts that remain coherent on a phone in the field.

### 12. Reduced motion is a first-class mode
Respect `prefers-reduced-motion`. Remove transforms and animated expansion where the operating system requests less motion.

### 13. Safety and compliance do not animate away
Safety-critical, legal or compliance warnings must remain stable and readable. Do not hide them behind playful motion or transient effects.

## Interaction review checklist

Before accepting a new Farm Return screen:

- Is the farm object or current state visible before any form?
- Is there one authoritative source for every displayed/editable fact?
- Can the farmer understand the page before opening any disclosure?
- Does each action sit beside the state it changes?
- Are details, maths and evidence progressively disclosed without being removed?
- Does motion clarify where content came from?
- Are hover, press and focus states subtle and consistent?
- Does the screen work with motion disabled?
- Are tap targets comfortable on mobile?
- Are unknowns, warnings and compliance states still explicit?
- Is there less interface chrome than information?
