// Shared utility — /api/lib/mailerlite.js
// Handles MailerLite subscriber creation and group management

const MAILERLITE_BASE = 'https://connect.mailerlite.com/api';

function headers() {
  return {
    'Authorization': `Bearer ${process.env.MAILERLITE_API_KEY}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
}

/**
 * Add or update a subscriber on MailerLite.
 * If the subscriber already exists, it gets updated (non-destructive).
 * Optionally assigns to group IDs.
 */
export async function upsertSubscriber({ email, name, surname, phone, groupIds }) {
  try {
    const body = {
      email,
      fields: {},
    };

    if (name) body.fields.name = name;
    if (surname) body.fields.last_name = surname;
    if (phone) body.fields.phone = phone;
    if (groupIds && groupIds.length > 0) body.groups = groupIds;

    const res = await fetch(`${MAILERLITE_BASE}/subscribers`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error('MailerLite upsertSubscriber error:', data);
      return null;
    }

    console.log(`MailerLite: subscriber ${email} upserted (id: ${data.data?.id})`);
    return data.data;
  } catch (err) {
    console.error('MailerLite upsertSubscriber exception:', err);
    return null;
  }
}

/**
 * Find a group by name. Returns the group object or null.
 */
export async function findGroupByName(name) {
  try {
    const res = await fetch(`${MAILERLITE_BASE}/groups?filter[name]=${encodeURIComponent(name)}&limit=1`, {
      method: 'GET',
      headers: headers(),
    });

    const data = await res.json();
    if (data.data && data.data.length > 0) {
      return data.data[0];
    }
    return null;
  } catch (err) {
    console.error('MailerLite findGroupByName exception:', err);
    return null;
  }
}

/**
 * Create a new group. Returns the group object.
 */
export async function createGroup(name) {
  try {
    const res = await fetch(`${MAILERLITE_BASE}/groups`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ name }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error('MailerLite createGroup error:', data);
      return null;
    }

    console.log(`MailerLite: group "${name}" created (id: ${data.data?.id})`);
    return data.data;
  } catch (err) {
    console.error('MailerLite createGroup exception:', err);
    return null;
  }
}

/**
 * Find or create a group by name. Returns the group ID.
 */
export async function findOrCreateGroup(name) {
  let group = await findGroupByName(name);
  if (group) {
    console.log(`MailerLite: group "${name}" found (id: ${group.id})`);
    return group.id;
  }
  group = await createGroup(name);
  return group ? group.id : null;
}

/**
 * Sync subscriber to MailerLite for NEWSLETTER signup.
 * Adds to a "Newsletter" group.
 */
export async function syncNewsletterSubscriber(email) {
  const groupId = await findOrCreateGroup('Newsletter');
  return upsertSubscriber({
    email,
    groupIds: groupId ? [groupId] : [],
  });
}

/**
 * Sync subscriber to MailerLite for EVENT booking.
 * Creates a group named after the event and adds the subscriber.
 */
export async function syncEventSubscriber({ email, name, surname, phone, eventTitle }) {
  // Find or create the event-specific group
  const eventGroupId = await findOrCreateGroup(`Evento: ${eventTitle}`);
  return upsertSubscriber({
    email,
    name,
    surname,
    phone,
    groupIds: eventGroupId ? [eventGroupId] : [],
  });
}

/**
 * Sync subscriber to MailerLite for MEMBERSHIP signup.
 * Adds to a "Soci" group.
 */
export async function syncMemberSubscriber({ email, name, surname, phone }) {
  const groupId = await findOrCreateGroup('Soci');
  return upsertSubscriber({
    email,
    name,
    surname,
    phone,
    groupIds: groupId ? [groupId] : [],
  });
}
