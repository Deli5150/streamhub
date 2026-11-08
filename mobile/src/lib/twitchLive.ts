import { channelKey, type LiveInfo } from '@shared/types'
import { sessionFor } from '../desktop/net'

// Twitch live status without a web page, for the background check (the page reader isn't running
// then). Asks Twitch's own GraphQL API as the signed-in user, with the session's auth-token cookie.

const TWITCH_WEB_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko'

interface Response {
  data?: {
    currentUser?: {
      followedLiveUsers?: {
        edges?: {
          node?: {
            login?: string
            stream?: { title?: string | null; viewersCount?: number; createdAt?: string; game?: { displayName?: string } | null } | null
          } | null
        }[]
      }
    } | null
  }
}

export async function twitchLiveFromApi(): Promise<LiveInfo[] | null> {
  const [cookie] = await sessionFor('twitch').cookies.get({ url: 'https://www.twitch.tv', name: 'auth-token' })
  if (!cookie?.value) return null
  const res = await fetch('https://gql.twitch.tv/gql', {
    method: 'POST',
    headers: { 'Client-Id': TWITCH_WEB_CLIENT_ID, Authorization: `OAuth ${decodeURIComponent(cookie.value)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: '{ currentUser { followedLiveUsers(first: 100) { edges { node { login stream { title viewersCount createdAt game { displayName } } } } } } }'
    })
  })
  if (!res.ok) return null
  const json = (await res.json()) as Response
  const edges = json.data?.currentUser?.followedLiveUsers?.edges
  if (!edges) return null
  return edges.flatMap(({ node }) => {
    if (!node?.login || !node.stream) return []
    const login = node.login.toLowerCase()
    return [
      {
        key: channelKey('twitch', login),
        title: node.stream.title ?? '',
        viewers: node.stream.viewersCount,
        category: node.stream.game?.displayName,
        startedAt: node.stream.createdAt,
        thumbnail: `https://static-cdn.jtvnw.net/previews-ttv/live_user_${login}-640x360.jpg?t=${Math.floor(Date.now() / 60_000)}`
      }
    ]
  })
}
