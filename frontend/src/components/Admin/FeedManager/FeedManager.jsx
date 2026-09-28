import { useState } from 'react'
import PhotoManager from '../PhotoManager/PhotoManager'
import VideoManager from '../VideoManager/VideoManager'
import './FeedManager.css'

export default function FeedManager() {
  const [tab, setTab] = useState('photos')

  return (
    <div className="feed-manager">
      <div className="feed-tabs">
        <button
          type="button"
          className={tab === 'photos' ? 'feed-tab feed-tab--active' : 'feed-tab'}
          onClick={() => setTab('photos')}
        >
          Fotos
        </button>
        <button
          type="button"
          className={tab === 'videos' ? 'feed-tab feed-tab--active' : 'feed-tab'}
          onClick={() => setTab('videos')}
        >
          Videos
        </button>
      </div>

      {tab === 'photos' ? <PhotoManager /> : <VideoManager />}
    </div>
  )
}