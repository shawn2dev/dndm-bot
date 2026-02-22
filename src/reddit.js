/**
 * Reach out to the reddit API, and get the first page of results from
 * given json. Filter out posts without readily available images or videos,
 * and return a random result.
 * @returns The url of an image or video
 */
export async function getContentUrl(json) {
  const response = await fetch(json, {
    headers: {
      'User-Agent': 'Over_Understanding69:shawnybot:v1.0.0 (by /u/Over_Understanding69)',
    },
  });
  if (!response.ok) {
    let errorText = `Error fetching ${response.url}: ${response.status} ${response.statusText}`;
    try {
      const error = await response.text();
      if (error) {
        errorText = `${errorText} \n\n ${error}`;
      }
    } catch {
      // ignore
    }
    throw new Error(errorText);
  }
  const data = await response.json();
  const posts = data.data.children
    .map((post) => {
      if (post.is_gallery) {
        return '';
      }
      return (
        post.data?.media?.reddit_video?.fallback_url ||
        post.data?.secure_media?.reddit_video?.fallback_url ||
        post.data?.url
      );
    })
    .filter((post) => !!post);
  const randomIndex = Math.floor(Math.random() * posts.length);
  const randomPost = posts[randomIndex];
  return randomPost;
}

export const redditUrl = 'https://www.reddit.com/r/aww/hot.json';
