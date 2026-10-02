import { useState } from 'react'
import PhotoManager from '../PhotoManager/PhotoManager'
import VideoManager from '../VideoManager/VideoManager'
import './FeedManager.css'

export default function FeedManager() {
  const [tab, setTab] = useState('photos')
  // VideoManager se monta la primera vez que se abre la pestaña y después
  // se queda montado (solo oculto). Si se desmontara al cambiar de
  // pestaña, la espera de "Listo" se cancelaría y el video nunca se
  // publicaría ni recibiría su miniatura.
  const [hasOpenedVideos, setHasOpenedVideos] = useState(false)

  function openTab(nextTab) {
    setTab(nextTab)
    if (nextTab === 'videos') {
      setHasOpenedVideos(true)
    }
  }

  return (
    <div className="feed-manager">
      <div className="feed-tabs">
        <button
          type="button"
          className={tab === 'photos' ? 'feed-tab feed-tab--active' : 'feed-tab'}
          onClick={() => openTab('photos')}
        >
          Fotos
        </button>
        <button
          type="button"
          className={tab === 'videos' ? 'feed-tab feed-tab--active' : 'feed-tab'}
          onClick={() => openTab('videos')}
        >
          Videos
        </button>
      </div>

      <div hidden={tab !== 'photos'}>
        <PhotoManager />
      </div>

      {hasOpenedVideos && (
        <div hidden={tab !== 'videos'}>
          <VideoManager />
        </div>
      )}
    </div>
  )
}