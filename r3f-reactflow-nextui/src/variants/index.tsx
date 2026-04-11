import React from 'react';
import { Link } from 'react-router-dom';
import styles from './VariantsIndex.module.css';

const VariantsIndex: React.FC = () => {
  return (
    <div className={styles.container}>
      <h1 className={styles.title}>PerSpatia Variant Gallery</h1>
      <p className={styles.subtitle}>
        Explore different visual and architectural prototypes side-by-side.
      </p>
      
      <div className={styles.grid}>
        <div className={styles.card}>
          <h2>v0: Legacy</h2>
          <p>The original implementation before the visual refactor. Used as a baseline.</p>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <Link to="/v0" className={styles.link}>Open v0</Link>
            <Link to="/v0/tests" className={styles.link} style={{ background: '#3f3f46', color: '#fff' }}>Sizing Sandbox</Link>
          </div>
        </div>

        <div className={styles.card}>
          <h2>v1: Math Sci-Fi</h2>
          <p>Theoretical Sci-Fi aesthetics. Pure geometry, neon vectors, glass/force-fields, zero engineering skeuomorphism.</p>
          <Link to="/v1" className={styles.link}>Open v1</Link>
        </div>
      </div>
    </div>
  );
};

export default VariantsIndex;
