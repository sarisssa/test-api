const MARKET_CLOSE_HOUR_EST = 16; // 4 PM EST
const BUFFER_MINUTES = 15;

export function calculateChallengeExpiration(
  category: 'stock' | 'crypto' | 'commodities',
  duration: 30 | 60 | 120 | 240
): string | null {
  // Crypto challenges never expire
  if (category === 'crypto') {
    return null;
  }

  // Get current time in EST
  const now = new Date();
  const estTime = new Date(
    now.toLocaleString('en-US', { timeZone: 'America/New_York' })
  );

  // Set expiration to 4PM EST today
  const expiration = new Date(estTime);
  expiration.setHours(MARKET_CLOSE_HOUR_EST, 0, 0, 0);

  // Subtract duration (in minutes) and buffer (15 minutes)
  expiration.setMinutes(expiration.getMinutes() - duration - BUFFER_MINUTES);

  return expiration.toISOString();
}

export function validateChallengeCreation(
  category: 'stock' | 'crypto' | 'commodities',
  duration: 30 | 60 | 120 | 240
): string | null {
  // Crypto challenges are always valid
  if (category === 'crypto') {
    return null;
  }

  // Get current time in EST
  const now = new Date();
  const estTime = new Date(
    now.toLocaleString('en-US', { timeZone: 'America/New_York' })
  );
  const dayOfWeek = estTime.getDay(); // 0 = Sunday, 6 = Saturday

  // Check if it's a weekend (markets are closed)
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    const dayName = dayOfWeek === 0 ? 'Sunday' : 'Saturday';
    return `Cannot create ${category} challenge on ${dayName}. Stock and commodities markets are closed on weekends. Please try again on a weekday.`;
  }

  const expiresAt = calculateChallengeExpiration(category, duration);
  if (!expiresAt) {
    return null;
  }

  const expiration = new Date(expiresAt);

  // If expiration time has already passed, challenge cannot be created
  if (now >= expiration) {
    const minutes = duration;
    const deadline = expiration.toLocaleTimeString('en-US', {
      timeZone: 'America/New_York',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

    return `Cannot create ${minutes}-minute ${category} challenge. The acceptance deadline (${deadline} EST) has already passed. Market closes at 4:00 PM EST.`;
  }

  return null;
}

export function isChallengeExpired(expiresAt?: string): boolean {
  if (!expiresAt) {
    return false; // Crypto challenges never expire
  }

  const now = new Date();
  const expiration = new Date(expiresAt);

  return now >= expiration;
}

export function getTimeUntilExpiration(expiresAt?: string): number | null {
  if (!expiresAt) {
    return null; // Crypto challenges never expire
  }

  const now = new Date();
  const expiration = new Date(expiresAt);
  const diffMs = expiration.getTime() - now.getTime();
  const diffMinutes = Math.floor(diffMs / 1000 / 60);

  return diffMinutes > 0 ? diffMinutes : 0;
}
