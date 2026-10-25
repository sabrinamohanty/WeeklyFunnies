import { api, userMessage } from '../lib/api'
import type { EditionBundle, PublishedPage, PublishedStory, ReactionCounts, ReactionKind } from '../lib/types'
import { toggledReaction } from '../lib/page-flow'
import { useStore } from '../store'

function sectionLabel(section: string) {
  return section ? section[0]!.toUpperCase() + section.slice(1) : 'News'
}

function memberOf(bundle: EditionBundle, userId: string) {
  return bundle.members.find(m => m.userId === userId) ?? null
}

export function withStoryReaction(
  bundle: EditionBundle,
  storyId: string,
  reactions: ReactionCounts,
  myReaction: ReactionKind | null,
): EditionBundle {
  return {
    ...bundle,
    pages: bundle.pages.map(page => ({
      ...page,
      stories: page.stories.map(story => story.id === storyId ? { ...story, reactions, myReaction } : story),
    })),
  }
}

export function PublishedStoryCard({
  bundle,
  page,
  story,
  onReaction,
}: {
  bundle: EditionBundle
  page: PublishedPage
  story: PublishedStory
  onReaction?: (storyId: string, reactions: ReactionCounts, myReaction: ReactionKind | null) => void
}) {
  const author = memberOf(bundle, page.authorId)
  return (
    <article className="story">
      <p className="kicker">{sectionLabel(story.section)}</p>
      <h2 className="headline">{story.headline}</h2>
      <p className="byline">By {author?.name || 'Staff'}</p>
      <p className="story-body">{story.body}</p>
      <StoryReactions editionId={bundle.edition.id} story={story} onReaction={onReaction} />
    </article>
  )
}

function StoryReactions({
  editionId,
  story,
  onReaction,
}: {
  editionId: string
  story: PublishedStory
  onReaction?: (storyId: string, reactions: ReactionCounts, myReaction: ReactionKind | null) => void
}) {
  const { set, toast } = useStore()
  const react = async (kind: ReactionKind) => {
    try {
      const next = toggledReaction(story.myReaction, kind)
      const { reactions, myReaction } = await api.setReaction(editionId, story.id, next)
      if (onReaction) onReaction(story.id, reactions, myReaction)
      else set(s => ({ bundle: s.bundle ? withStoryReaction(s.bundle, story.id, reactions, myReaction) : s.bundle }))
    } catch (e) {
      toast(userMessage(e))
    }
  }
  return (
    <div className="reactions">
      {(['ha', 'aww', 'hooray'] as const).map(k => (
        <button key={k} type="button" className={`reaction ${story.myReaction === k ? 'on' : ''}`} onClick={() => void react(k)}>
          {k === 'ha' ? 'Ha' : k === 'aww' ? 'Aww' : 'Hooray'}<span>{story.reactions[k]}</span>
        </button>
      ))}
    </div>
  )
}
