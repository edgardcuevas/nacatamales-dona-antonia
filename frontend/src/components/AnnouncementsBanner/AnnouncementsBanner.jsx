import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import './AnnouncementsBanner.css'

const TYPE_LABELS = {
  AVAILABLE: 'Disponible',
  SOLD_OUT: 'Agotado',
  PROMOTION: 'Promoción',
  INFO: 'Aviso',
}

export default function AnnouncementsBanner() {
  const [announcements, setAnnouncements] = useState([])

  useEffect(() => {
    let isMounted = true

    api
      .get('/announcements')
      .then((data) => {
        if (isMounted) {
          setAnnouncements(data.announcements || [])
        }
      })
      .catch(() => {
        // Si falla, simplemente no mostramos alertas.
      })

    return () => {
      isMounted = false
    }
  }, [])

  if (announcements.length === 0) {
    return null
  }

  return (
    <div className="announcements">
      {announcements.map((announcement) => (
        <div key={announcement.id} className={`announcement announcement--${announcement.type.toLowerCase()}`}>
          <span className="announcement__tag">{TYPE_LABELS[announcement.type] || 'Aviso'}</span>
          <div className="announcement__body">
            <strong>{announcement.title}</strong>
            <p>{announcement.content}</p>
          </div>
        </div>
      ))}
    </div>
  )
}