/** Maps the public Invita-Ya invitation payload to renderer inputs. Pure, so it is unit-testable offline. */
const TOKEN = /^[A-Za-z0-9_-]{8,24}$/;

export function parseTarget(input, base) {
  const raw = String(input).trim();
  if (TOKEN.test(raw)) return { origin: new URL(base).origin, token: raw };
  let url;
  try { url = new URL(raw); } catch { throw new Error('Indica un enlace de invitación o su token.'); }
  const token = url.pathname.split('/').filter(Boolean).at(-1) ?? '';
  if (url.protocol !== 'https:' || !TOKEN.test(token)) throw new Error('El enlace no parece una invitación de Invita-Ya.');
  return { origin: url.origin, token };
}

const absolute = (value, origin) => { try { return new URL(value, origin).href; } catch { return null; } };

export function pickAssets(invitation, origin) {
  const config = invitation.customConfig ?? {};
  const ai = config.ai ?? {};
  const experience = config.experience ?? {};
  const details = invitation.eventDetails ?? {};
  const photos = (Array.isArray(experience.photos) ? experience.photos : [])
    .filter((photo) => photo && typeof photo.url === 'string')
    .map((photo) => ({ url: absolute(photo.url, origin), caption: typeof photo.caption === 'string' ? photo.caption : '' }))
    .filter((photo) => photo.url);
  return {
    hero: absolute(ai.mobileImageUrl || ai.imageUrl || '', origin),
    photos,
    music: experience.music === 'custom' && experience.customMusic?.url ? absolute(experience.customMusic.url, origin) : null,
    spec: {
      title: invitation.title,
      honoree: details.honoreeName,
      age: details.age,
      message: details.customMessage,
      eventDate: invitation.eventDate,
      time: details.eventTime,
      place: details.locationName,
      address: details.locationAddress,
      palette: ai.palette,
    },
  };
}
