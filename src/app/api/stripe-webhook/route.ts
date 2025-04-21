// in api folder are public server endpoints, to communicate with stripe, we must use public server endpoint
// we have to store in here to match proper naming convention on stripe and for public access

// in server actions thing like status code, deserialize & serialize are abstracted for us
import stripe from "@/lib/stripe";
import { NextRequest } from "next/server";
import { env } from "@/env";
import Stripe from "stripe";
import { clerkClient } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";

// CANNOT BE Default exports, must be normal
export async function POST(req: NextRequest) {
  try {
    const payload = await req.text();
    const signature = req.headers.get("stripe-signature");

    // if signature is missing, it is not stripe
    if (!signature) {
      return new Response("Signature is missing", { status: 400 });
    }

    const event = stripe.webhooks.constructEvent(
      payload,
      signature,
      env.STRIPE_WEBHOOK_SECRET,
    );

    console.log(`Received event: ${event.type}`, event.data.object);
    // Stripe does not guarantee that we receive these 3 events in the correct order
    switch (event.type) {
      case "checkout.session.completed":
        await handleSessionCompleted(event.data.object);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await handleSubscriptionCreatedOrUpdated(event.data.object.id);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object);
        break;
      default:
        console.log(`Unhandled event type: ${event.type}`);
        break;
    }

    return new Response("Event received", { status: 200 });
  } catch (error) {
    console.error(error);
    return new Response("Internal server error", { status: 500 });
  }
}

async function handleSessionCompleted(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.userId;

  if (!userId) {
    throw new Error("User ID is missing in session metadata");
  }

  // store stripeId in meta - clerk docs for more
  await (
    await clerkClient()
  ).users.updateUserMetadata(userId, {
    privateMetadata: {
      stripeCustomerId: session.customer as string,
    },
  });
}

async function handleSubscriptionCreatedOrUpdated(subscriptionId: string) {
  // Not perfect - may not handle all stripe edge cases... eh... it's good enough
  // rather than fetch an event, we fetch based on subscriptionId, this way we rely on idempotency to get recent subscription
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);

  if (
    subscription.status === "active" ||
    subscription.status === "trialing" || // strip doc to learn more about statuses
    subscription.status === "past_due"
  ) {
    await prisma.userSubscription.upsert({
      // upsert works no matter if we receive a created/update event
      where: {
        userId: subscription.metadata.userId,
      },
      create: {
        userId: subscription.metadata.userId,
        stripeSubscriptionId: subscription.id,
        stripeCustomerId: subscription.customer as string,
        stripePriceId: subscription.items.data[0].price.id, //used to identify pricing tier
        stripeCurrentPeriodEnd: new Date(
          subscription.current_period_end * 1000,
        ),
        stripeCancelAtPeriodEnd: subscription.cancel_at_period_end,
      },
      update: {
        stripePriceId: subscription.items.data[0].price.id,
        stripeCurrentPeriodEnd: new Date(
          subscription.current_period_end * 1000,
        ),
        stripeCancelAtPeriodEnd: subscription.cancel_at_period_end,
      },
    });
  } else {
    // represent non active subscription by deleting in DB ****
    // edgecases here? **** user can keep retrialing
    await prisma.userSubscription.deleteMany({
      // if subsc != exist .deleteMany() still suceeds, however .delete() will throw error
      where: {
        stripeCustomerId: subscription.customer as string,
      },
    });
  }
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  await prisma.userSubscription.deleteMany({
    where: {
      stripeCustomerId: subscription.customer as string,
    },
  });
}
