import * as cheerio from 'cheerio';

export function daysSinceTargetDate(targetDate, timezone) {
    // Parse the target date into a Date object and convert to the specified timezone.
    const target = new Date(targetDate + "T00:00:00Z"); // Create target date in UTC
    
    // Get current date in the specified timezone and convert it to the same time format
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: timezone }));
    
    // Normalize both dates to midnight UTC time
    const targetDateUTC = Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate());
    const nowDateUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  
    // Calculate the difference in time (in milliseconds)
    const timeDifference = nowDateUTC - targetDateUTC;
  
    // Convert the difference from milliseconds to days
    const daysPassed = Math.floor(timeDifference / (1000 * 60 * 60 * 24)) + 1;
  
    return daysPassed;
}

export async function getRandomMp4(url) {
    // Fetch the HTML content using standard fetch API (works in Cloudflare Workers)
    const response = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
    });
    
    if (!response.ok) {
        throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
    }
    
    const html = await response.text();
    const $ = cheerio.load(html);
    const mp4Urls = [];
    
    $('a[href$=".mp4"]').each((i, el) => {
        const href = $(el).attr('href');
        // Make absolute URL if relative
        const absoluteUrl = new URL(href, url).href;
        mp4Urls.push(absoluteUrl);
    });
    
    if (mp4Urls.length === 0) {
        throw new Error('No MP4 files found at the given URL');
    }
    
    const randomIndex = Math.floor(Math.random() * mp4Urls.length);
    return mp4Urls[randomIndex];
}