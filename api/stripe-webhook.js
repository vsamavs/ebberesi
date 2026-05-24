export default async function handler(req, res) {
  console.log("\n================ WEBHOOK START ================");
  console.log("METHOD:", req.method);
  console.log("URL:", req.url);
  console.log("HOST:", req.headers.host);
  console.log("ORIGIN:", req.headers.origin);
  console.log("USER-AGENT:", req.headers["user-agent"]);
  console.log("CONTENT-TYPE:", req.headers["content-type"]);

  if (req.method !== 'POST') {
    console.log("❌ METHOD NOT ALLOWED");
    return res.status(405).end();
  }

  try {
    console.log("➡️ Reading raw body...");
    const rawBody = await getRawBody(req);
    console.log("✔️ Raw body size:", rawBody.length);

    const sig = req.headers['stripe-signature'];
    console.log("➡️ Stripe signature present:", !!sig);

    console.log("➡️ Constructing Stripe event...");
    const event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );

    console.log("✔️ Stripe event received:", event.type);

    // ---------------- EVENT CHECK ----------------
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;

      console.log("💳 Checkout session received");
      console.log("SESSION ID:", session.id);
      console.log("METADATA:", session.metadata);

      const bookingId = session.metadata?.bookingId;

      if (!bookingId) {
        console.log("❌ Missing bookingId in metadata");
        return res.status(200).json({ ignored: true });
      }

      console.log("📌 Booking ID:", bookingId);

      console.log("➡️ Confirming booking...");
      await confirmBooking(db, bookingId, session.payment_intent);
      console.log("✔️ Booking confirmed");

      console.log("➡️ Fetching booking...");
      const bookingDoc = await db.collection('bookings').doc(bookingId).get();

      if (!bookingDoc.exists) {
        console.log("❌ Booking not found in DB");
      }

      const booking = bookingDoc.data();
      console.log("📦 Booking data:", booking);

      // ---------------- EMAIL ----------------
      if (booking && booking.eventId) {
        console.log("📧 Sending booking email...");

        try {
          const eventDoc = await db.collection('events').doc(booking.eventId).get();
          const eventData = eventDoc.exists ? eventDoc.data() : {};

          console.log("🎫 Event data:", eventData);

          const eventDate = eventData.date?.toDate ? eventData.date.toDate() : null;

          const months = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];

          const dateFormatted = eventDate
            ? `${eventDate.getDate()} ${months[eventDate.getMonth()]} ${eventDate.getFullYear()} — ${String(eventDate.getHours()).padStart(2,'0')}:${String(eventDate.getMinutes()).padStart(2,'0')}`
            : '';

          console.log("📅 Formatted date:", dateFormatted);

          await sendBookingConfirmation({
            ...booking,
            bookingId,
            eventDate: dateFormatted,
            eventLocation: eventData.location || booking.eventLocation || '',
          });

          console.log("✔️ Email sent");
        } catch (emailErr) {
          console.error("❌ Email error:", emailErr);
        }
      } else {
        console.log("ℹ️ No event email required");
      }

      // ---------------- MEMBERSHIP ----------------
      console.log("➡️ Checking membership...");
      await activateMembershipIfNeeded(db, bookingId);
      console.log("✔️ Membership processed");

      console.log(`🎉 DONE: Booking ${bookingId} processed`);
    }

    console.log("================ WEBHOOK END ================\n");

    res.status(200).json({ received: true });

  } catch (err) {
    console.error("\n🔥 WEBHOOK ERROR");
    console.error("Message:", err.message);
    console.error("Stack:", err.stack);

    res.status(400).json({ error: err.message });
  }
}