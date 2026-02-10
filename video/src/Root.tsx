import React from 'react';
import {Composition} from 'remotion';
import {DluluDemoV2, type DluluDemoV2Props} from './Main';

export const Root: React.FC = () => {
  const defaultProps: DluluDemoV2Props = {
    voSrc: null,
    musicSrc: null,
    captionsSrc: null,
  };

  return (
    <>
      <Composition
        id="DluluDemoV2"
        component={DluluDemoV2}
        durationInFrames={4500}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={defaultProps}
      />
    </>
  );
};

