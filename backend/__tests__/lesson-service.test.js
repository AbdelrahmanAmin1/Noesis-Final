'use strict';

const lessons = require('../services/lesson.service');
const ai = require('../services/ai.service');
const { scoreVideoScript } = require('../services/video-quality.service');

function generatedLessonJson(topic = 'Encapsulation') {
  return JSON.stringify({
    topic,
    audienceLevel: 'beginner',
    lessonType: topic === 'Linked List' ? 'data_structure' : 'oop',
    sourceMaterial: { title: `${topic} Lecture`, grounding: 'strong', selectedChunkIds: [1] },
    learningObjectives: [
      `Explain ${topic} with precise vocabulary.`,
      `Apply ${topic} in a small code example.`,
    ],
    prerequisites: ['Classes and objects'],
    sections: [
      { type: 'hook', title: 'Start Here', content: `${topic} matters because it connects vocabulary to working code.` },
      { type: 'definition', title: 'Core Definition', content: `${topic} is a concrete CS concept with rules that guide implementation.` },
      { type: 'deep_explanation', title: 'Deep Explanation', content: `A useful understanding of ${topic} connects the rule, the visual model, and the code behavior.` },
      {
        type: 'diagram',
        title: 'Visual Model',
        content: 'Use the diagram to name each part before reading the code.',
        diagram: {
          type: topic === 'Linked List' ? 'linked_list' : 'uml_class',
          nodes: [{ id: 'A', label: 'Concept' }, { id: 'B', label: 'Example' }, { id: 'C', label: 'Rule' }],
          edges: [['A', 'B'], ['B', 'C']],
          caption: 'The diagram links the rule to the example.',
        },
      },
      {
        type: 'code_example',
        title: 'Working Code',
        content: 'This code is intentionally small enough to trace.',
        code: {
          language: 'java',
          content: 'class BankAccount {\n  private int balance;\n  void deposit(int amount) { if (amount > 0) balance += amount; }\n  int getBalance() { return balance; }\n}',
          explanation: [
            { lineRange: '1-2', text: 'The class owns private state.' },
            { lineRange: '3', text: 'The method controls valid updates.' },
          ],
        },
      },
      { type: 'code_walkthrough', title: 'Walkthrough', content: 'First identify the state, then identify the operation that safely changes it.' },
      {
        type: 'common_mistakes',
        title: 'Common Mistakes',
        cards: [{ title: 'Skipping the rule', text: 'Students often memorize syntax without explaining why the rule protects behavior.' }],
      },
      {
        type: 'checkpoint',
        title: 'Mini Checkpoint',
        content: 'Answer before moving on.',
        quiz: [{ question: `What should you name first when explaining ${topic}?`, options: ['The rule', 'The file name'], answer: 'The rule', explanation: 'The rule explains why the code is written that way.' }],
      },
      { type: 'recap', title: 'Recap', content: `${topic} is strongest when definition, visual model, and code agree.` },
      { type: 'next_steps', title: 'Next Steps', content: 'Practice with a second example and explain the common mistake.' },
    ],
    relatedTopics: ['Abstraction'],
  });
}

describe('lesson.service', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('extracts markdown from JSON-wrapped note responses', () => {
    const raw = '{"title":"Chapter 10","markdown":"## Inheritance\\n\\nA child class extends a parent class."}';
    const md = lessons.extractMarkdownFromModelOutput(raw);
    expect(md).toContain('## Inheritance');
    expect(md).not.toContain('{"title"');
    expect(md).not.toContain('\\n');
  });

  it('creates an inheritance fallback lesson with required teaching assets', () => {
    const lesson = lessons.fallbackLesson('Inheritance');
    const text = JSON.stringify(lesson).toLowerCase();
    expect(lesson.sections.some(s => s.type === 'code_example')).toBe(true);
    expect(lesson.sections.some(s => s.type === 'diagram')).toBe(true);
    expect(text).toContain('shape');
    expect(text).toContain('circle');
    expect(text).toContain('rectangle');
    expect(text).toContain('extends');
    expect(text).toContain('composition');
  });

  it('fails generic chapter lessons instead of saving placeholder notes', () => {
    const lesson = lessons.fallbackLesson('Chapter 10');
    const quality = lessons.scoreLesson(lesson);
    expect(quality.passed).toBe(false);
    expect(quality.genericFailure).toBe(true);
  });

  it('generates grounded non-CS notes without CS injection', () => {
    const chunks = [
      { id: 1, chapter_title: 'Photosynthesis', heading: 'Light Energy', keywords_json: JSON.stringify(['chloroplasts', 'glucose', 'carbon dioxide']), text: 'Photosynthesis converts light energy, carbon dioxide, and water into glucose inside chloroplasts.' },
      { id: 2, chapter_title: 'Plant Cells', heading: 'Chloroplast Function', keywords_json: JSON.stringify(['chlorophyll', 'oxygen', 'plant cells']), text: 'Chlorophyll captures sunlight, and oxygen is released as a product of the process.' },
    ];
    const lesson = lessons.fallbackLesson('Chapter 1', {
      domain: 'science',
      chunks,
      materialTitle: 'Plant Biology Lecture',
      groundingTier: 'strong',
    });
    const text = JSON.stringify(lesson).toLowerCase();
    const quality = lessons.scoreLesson(lesson, { domain: 'science', chunks });

    expect(quality.passed).toBe(true);
    expect(text).toContain('photosynthesis');
    expect(text).toContain('chloroplast');
    expect(text).toContain('glucose');
    expect(text).toContain('oxygen');
    expect(text).not.toMatch(/stack|queue|search algorithm|object-oriented|java/);
  });

  it('allows a generic chapter title when source chunks provide useful general content', () => {
    const chunks = [
      { id: 3, chapter_title: 'Chapter 1', heading: 'Customer Value', keywords_json: JSON.stringify(['customer value', 'brand positioning']), text: 'Customer value explains why buyers choose one brand over another in a market.' },
    ];
    const lesson = lessons.fallbackLesson('Chapter 1', {
      domain: 'business',
      chunks,
      materialTitle: 'Chapter 1',
      groundingTier: 'strong',
    });
    const quality = lessons.scoreLesson(lesson, { domain: 'business', chunks });

    expect(quality.passed).toBe(true);
    expect(lesson.topic).toMatch(/Customer Value|Brand Positioning|Study Notes/i);
    expect(JSON.stringify(lesson)).not.toMatch(/concrete example required|code sketch/i);
  });

  it('builds anatomy notes from the source outline instead of shallow filename prose', () => {
    const chunks = [
      {
        id: 20,
        idx: 0,
        chapter_title: 'Introduction to Anatomy: The Skeletal System',
        heading: 'Introduction to Anatomy: The Skeletal System',
        text: 'The skeletal system supports the body, stores minerals, produces red blood cells, protects organs and tissues, and enables movement using levers.',
        keywords_json: JSON.stringify(['skeletal system', 'support', 'mineral storage', 'red blood cell production']),
      },
      {
        id: 21,
        idx: 1,
        chapter_title: 'Axial Skeleton',
        heading: 'Axial Skeleton',
        text: 'The axial skeleton includes the skull, vertebral column, ribs, and sternum.',
        keywords_json: JSON.stringify(['axial skeleton', 'skull', 'vertebrae']),
      },
      {
        id: 22,
        idx: 2,
        chapter_title: 'Appendicular Skeleton',
        heading: 'Appendicular Skeleton',
        text: 'The appendicular skeleton includes upper limb bones, lower limb bones, shoulder girdle, and pelvic girdle.',
        keywords_json: JSON.stringify(['appendicular skeleton', 'upper limb bones', 'lower limb bones']),
      },
      {
        id: 23,
        idx: 3,
        chapter_title: 'Shapes of Bones',
        heading: 'Shapes of Bones',
        text: 'Long bones, short bones, flat bones, irregular bones, and sesamoid bones are common bone shape categories.',
        keywords_json: JSON.stringify(['bone shapes', 'long bones', 'flat bones']),
      },
    ];
    const lesson = lessons.fallbackLesson('Document', {
      domain: 'science',
      chunks,
      materialTitle: '411skeletal.pdf',
      groundingTier: 'strong',
    });
    const text = JSON.stringify(lesson).toLowerCase();
    const quality = lessons.scoreLesson(lesson, { domain: 'science', chunks });

    expect(quality.passed).toBe(true);
    expect(lesson.topic).toMatch(/skeletal system/i);
    expect(text).toMatch(/support|mineral|red blood|protects organs|movement/);
    expect(text).toMatch(/axial skeleton|appendicular skeleton|shapes of bones/);
    expect(text).toMatch(/source outline|key concepts explained|important details|review questions|exam-ready summary/);
    expect(text).not.toMatch(/bones matters because|name one key idea from 411skeletal|choose one concrete detail|read the material as|treat the material like|source-backed ideas|concrete example required|search algorithm|java/);
  });

  it('rejects generic instructional general notes with weak source-fact coverage', () => {
    const chunks = [
      {
        id: 70,
        idx: 0,
        chapter_title: 'General Biology',
        heading: 'Cell Membrane',
        text: 'The cell membrane is a selectively permeable barrier. It controls movement of substances into and out of the cell. Examples include diffusion, osmosis, and active transport.',
      },
      {
        id: 71,
        idx: 1,
        chapter_title: 'Transport Types',
        heading: 'Transport Types',
        text: 'Passive transport does not require energy, while active transport uses energy to move materials against a concentration gradient.',
      },
    ];
    const sourceOutline = require('../services/material-understanding.service').buildSourceOutline(chunks, { title: 'biology.pdf' });
    const weak = lessons.normalizeLesson({
      topic: 'Cell Membrane',
      audienceLevel: 'beginner',
      lessonType: 'general',
      sourceMaterial: { title: 'biology.pdf', grounding: 'strong', selectedChunkIds: [70, 71] },
      learningObjectives: ['Understand the source.', 'Review a concept.'],
      sections: [
        { type: 'hook', title: 'Overview', content: 'Read the material as a sequence of source-backed ideas.' },
        { type: 'definition', title: 'Definition', content: 'Choose one concrete detail from the uploaded material.' },
        { type: 'deep_explanation', title: 'Key Concepts', content: 'Name one key idea and explain it.' },
        { type: 'deep_explanation', title: 'Details', content: 'For each idea, write the definition.' },
        { type: 'common_mistakes', title: 'Mistakes', content: 'Do not be vague.' },
        { type: 'checkpoint', title: 'Review', content: 'What is this?', quiz: [{ question: 'What is this?', answer: 'A concept.' }] },
        { type: 'recap', title: 'Summary', content: 'The detailed notes above are useful.' },
        { type: 'next_steps', title: 'Next', content: 'Study more.' },
      ],
      relatedTopics: [],
    });

    const quality = lessons.scoreLesson(weak, { domain: 'science', chunks, sourceOutline });

    expect(quality.passed).toBe(false);
    expect(quality.generalInstructionalFailure).toBe(true);
    expect(quality.weakSourceFactCoverage).toBe(true);
  });

  it('builds source-fact fallback notes for non-CS business material', () => {
    const chunks = [
      {
        id: 80,
        idx: 0,
        chapter_title: 'Marketing Strategy',
        heading: 'Segmentation',
        text: 'Market segmentation divides customers into groups with similar needs. Examples include demographic, geographic, behavioral, and psychographic segments.',
      },
      {
        id: 81,
        idx: 1,
        chapter_title: 'Targeting',
        heading: 'Targeting',
        text: 'Targeting means choosing which segment the company will serve. A target market should be measurable, reachable, and profitable.',
      },
      {
        id: 82,
        idx: 2,
        chapter_title: 'Positioning',
        heading: 'Positioning',
        text: 'Positioning explains how the brand should be perceived compared with competitors.',
      },
    ];
    const sourceOutline = require('../services/material-understanding.service').buildSourceOutline(chunks, { title: 'marketing.pdf' });
    const lesson = lessons.generalMaterialLesson('Marketing Strategy', 'marketing.pdf', 'strong', [80, 81, 82], chunks, { domain: 'business', sourceOutline });
    const text = JSON.stringify(lesson).toLowerCase();
    const quality = lessons.scoreLesson(lesson, { domain: 'business', chunks, sourceOutline });

    expect(quality.passed).toBe(true);
    expect(text).toMatch(/market segmentation divides customers|targeting means choosing|positioning explains/);
    expect(text).toMatch(/examples include demographic|measurable, reachable, and profitable/);
    expect(text).not.toMatch(/choose one concrete detail|read the material as|name one key idea|source-backed ideas/);
  });

  it('converts general notes into source-led video scenes without generic objective maps', () => {
    const chunks = [
      {
        id: 20,
        idx: 0,
        chapter_title: 'Introduction to Anatomy: The Skeletal System',
        heading: 'Introduction to Anatomy: The Skeletal System',
        text: 'The skeletal system supports the body, stores minerals, produces red blood cells, protects organs, and enables movement.',
        keywords_json: JSON.stringify(['skeletal system', 'support', 'mineral storage', 'red blood cell production']),
      },
      {
        id: 21,
        idx: 1,
        chapter_title: 'Axial Skeleton',
        heading: 'Axial Skeleton',
        text: 'The axial skeleton includes the skull, vertebral column, ribs, and sternum.',
        keywords_json: JSON.stringify(['axial skeleton', 'skull', 'vertebrae']),
      },
      {
        id: 22,
        idx: 2,
        chapter_title: 'Appendicular Skeleton',
        heading: 'Appendicular Skeleton',
        text: 'The appendicular skeleton includes upper limb bones, lower limb bones, shoulder girdle, and pelvic girdle.',
        keywords_json: JSON.stringify(['appendicular skeleton', 'upper limb bones', 'lower limb bones']),
      },
    ];
    const lesson = lessons.fallbackLesson('411skeletal', {
      domain: 'science',
      chunks,
      materialTitle: '411skeletal.pdf',
      groundingTier: 'strong',
    });
    const script = lessons.lessonToVideoScript(lesson);
    const all = JSON.stringify(script).toLowerCase();

    expect(script.slides.some(slide => ['cards', 'table', 'source_reference', 'none'].includes(slide.visual_type))).toBe(true);
    expect(all).toMatch(/skeletal system|axial skeleton|appendicular skeleton/);
    expect(all).not.toMatch(/why it matters|visual model|hash function|bucket|collision|java/);
  });

  it('passes grounded general notes without requiring a diagram or code scene', () => {
    const chunks = [
      { id: 30, idx: 0, chapter_title: 'Demand', heading: 'Demand', text: 'Demand describes how consumers choose quantities at different prices in a market.' },
      { id: 31, idx: 1, chapter_title: 'Supply', heading: 'Supply', text: 'Supply describes how producers offer quantities based on costs, capacity, and expected revenue.' },
    ];
    const lesson = lessons.normalizeLesson({
      topic: 'Supply And Demand',
      lessonType: 'general',
      sourceMaterial: { title: 'Document', grounding: 'strong', selectedChunkIds: [30, 31] },
      learningObjectives: ['Explain demand from the source.', 'Explain supply from the source.'],
      sections: [
        { type: 'hook', title: 'Market Choices', content: 'Demand and supply explain market choices using consumers, producers, quantities, prices, costs, capacity, and revenue.' },
        { type: 'definition', title: 'Demand', content: 'Demand describes how consumers choose quantities at different prices in a market.' },
        { type: 'deep_explanation', title: 'Supply', content: 'Supply describes how producers offer quantities based on costs, capacity, and expected revenue.' },
        { type: 'analogy', title: 'Mental Model', content: 'Treat the market as two source-backed views: consumer quantity choices and producer quantity offers.' },
        { type: 'deep_explanation', title: 'Source-Based Case', content: 'A price change can shift the quantity consumers want and the quantity producers are willing to offer.' },
        { type: 'common_mistakes', title: 'Common Mistakes', cards: [{ title: 'Ignoring source terms', text: 'Do not discuss markets without naming demand, supply, price, quantity, cost, and revenue.' }] },
        { type: 'checkpoint', title: 'Mini Checkpoint', content: 'Which side names consumer quantity choices at different prices?', quiz: [{ question: 'Which concept names consumer quantity choices?', answer: 'Demand', explanation: 'Demand is the consumer side in the uploaded source.' }] },
        { type: 'recap', title: 'Recap', content: 'Demand names consumer choices, supply names producer offers, and price, quantity, cost, capacity, and revenue connect them.' },
        { type: 'next_steps', title: 'Next Steps', content: 'Make flashcards for demand, supply, price, quantity, cost, capacity, and revenue.' },
      ],
    }, { skipEnsureFallback: true });
    const sectionTypes = lesson.sections.map(section => section.type);
    const quality = lessons.scoreLesson(lesson, { domain: 'business', chunks });

    expect(quality.passed).toBe(true);
    expect(sectionTypes).not.toContain('code_example');
    expect(sectionTypes).not.toContain('code_walkthrough');
    expect(sectionTypes).not.toContain('diagram');
  });

  it('converts a lesson into a video script that passes stricter inheritance scoring', () => {
    const lesson = lessons.fallbackLesson('Inheritance');
    const script = lessons.lessonToVideoScript(lesson);
    const quality = scoreVideoScript(script, { concept: 'Inheritance', chunks: [], threshold: 0.75 });
    expect(quality.passed).toBe(true);
    expect(quality.criteria.find(c => c.name === 'inheritance_specifics').passed).toBe(true);
    expect(script.slides.every(s => !s.callouts || s.callouts.length === 0)).toBe(true);
    expect(script.slides.every(s => (s.bullets || []).length <= 2)).toBe(true);
    expect(script.slides.flatMap(s => s.bullets || []).every(b => b.split(/\s+/).length <= 5 || /\w+\.\w+\(\)/.test(b))).toBe(true);
    expect(script.slides.every(s => !/\b(the|but|because|with|to)$/i.test(s.title))).toBe(true);
    expect(script.slides.some(s => s.sceneType === 'code_walkthrough' && s.code_focus && s.code_focus.lineRange)).toBe(true);
    expect(JSON.stringify(script)).not.toContain('...');
  });

  it('preserves linked-list complexity and diagram content', () => {
    const lesson = lessons.fallbackLesson('Linked List');
    const text = JSON.stringify(lesson).toLowerCase();
    expect(text).toContain('head');
    expect(text).toContain('next');
    expect(text).toContain('o(1)');
    expect(text).toContain('o(n)');
  });

  it('passes educational context into the generated notes prompt', async () => {
    const spy = vi.spyOn(ai, 'generate').mockResolvedValueOnce(generatedLessonJson('Encapsulation'));
    const lesson = await lessons.generateEducationalLesson({
      topic: 'Encapsulation',
      title: 'Encapsulation Lecture',
      materialTitle: 'OOP Course',
      chunks: [{ id: 1, text: 'The uploaded material says encapsulation protects state.' }],
      groundingTier: 'strong',
      curatedTopicId: 'oop_encapsulation',
      educationalContextPrompt: 'uploaded material first; curated knowledge second; BankAccount private balance',
    });

    const prompt = spy.mock.calls[0][0];
    expect(prompt).toContain('Educational context');
    expect(prompt).toContain('uploaded material first');
    expect(prompt).toContain('BankAccount');
    expect(prompt).toContain('primary source for course-specific facts');
    expect(lesson.quality.passed).toBe(true);
  });

  it('keeps note generation compatible without educational context', async () => {
    const spy = vi.spyOn(ai, 'generate').mockResolvedValueOnce(generatedLessonJson('Encapsulation'));
    const lesson = await lessons.generateEducationalLesson({
      topic: 'Encapsulation',
      chunks: [{ id: 1, text: 'Encapsulation bundles data with methods.' }],
      groundingTier: 'moderate',
    });

    const prompt = spy.mock.calls[0][0];
    expect(prompt).not.toContain('Educational context:\n');
    expect(lesson.sections.some(s => s.type === 'code_example')).toBe(true);
  });

  it('does not expose source chunk ids in markdown output', () => {
    const lesson = lessons.normalizeLesson({
      topic: 'Encapsulation',
      lessonType: 'oop',
      learningObjectives: ['Explain encapsulation', 'Identify safe access'],
      sections: [{
        type: 'definition',
        title: 'Definition',
        content: 'Encapsulation keeps data private and exposes safe operations.',
        callouts: [{ type: 'source', text: 'This claim is source-backed.', sourceChunkIds: [42] }],
      }],
    });

    const md = lessons.lessonToMarkdown(lesson);
    expect(md).toContain('source-backed');
    expect(md).not.toContain('[chunk:42]');
    expect(md).not.toContain('source 42');
  });
});
