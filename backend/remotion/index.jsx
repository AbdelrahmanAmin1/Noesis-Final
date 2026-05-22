import React from 'react';
import { Composition, registerRoot } from 'remotion';
import { TutorScene } from './TutorScene.jsx';

export const RemotionRoot = () => (
  <Composition
    id="TutorScene"
    component={TutorScene}
    width={1280}
    height={720}
    fps={30}
    durationInFrames={9000}
    defaultProps={{
      scene: {
        title: 'Polymorphism',
        teachingGoal: 'See how one reference can dispatch to different overridden methods.',
        visualTemplate: 'polymorphism_dispatch',
        visualType: 'polymorphism_dispatch',
        visualData: { nodes: ['Shape reference', 'Circle object', 'Circle.area()'] },
      },
      slide: {
        title: 'Runtime dispatch',
        bullets: ['Shape reference', 'Runtime object'],
        narration: '',
      },
    }}
  />
);

registerRoot(RemotionRoot);
