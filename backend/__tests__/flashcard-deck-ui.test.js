'use strict';

const fs = require('fs');
const path = require('path');

describe('Flashcard deck picker UI', () => {
  it('starts with material decks and scopes all study requests to the selected material', () => {
    const file = path.join(__dirname, '..', '..', 'project', 'components', 'Study.jsx');
    const source = fs.readFileSync(file, 'utf8');

    expect(source).toContain('Choose material / deck');
    expect(source).toContain('Study Flashcards');
    expect(source).toContain('No flashcard decks yet');
    expect(source).toMatch(/flashcards\.decks\(\)/);
    expect(source).toMatch(/flashcards\.list\(selectedDeck\.material_id\)/);
    expect(source).toMatch(/flashcards\.due\(selectedDeck\.material_id\)/);
    expect(source).not.toMatch(/flashcards\.due\(\)\s*;/);
  });
});
