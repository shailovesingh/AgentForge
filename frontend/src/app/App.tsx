import { ReactFlowProvider } from '@xyflow/react'
import { Canvas } from '../canvas/Canvas'
import { ConfigPanel } from '../config-panel/ConfigPanel'
import { Library } from '../library/Library'
import styles from './App.module.css'
import { Toolbar } from './Toolbar'

export default function App() {
  return (
    // The provider lets the library (a sibling of the canvas) read the viewport.
    <ReactFlowProvider>
      <div className={styles.app}>
        <Toolbar />
        <div className={styles.main}>
          <Library />
          <Canvas />
          <ConfigPanel />
        </div>
      </div>
    </ReactFlowProvider>
  )
}
