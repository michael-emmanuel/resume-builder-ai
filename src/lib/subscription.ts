import { cache } from "react";
import prisma from "./prisma";
import { env } from "@/env";

export type SubscriptionLevel = "free" | "pro" | "pro_plus";

// deduplicates multiple reqs on same page (caches)
// avoids unnecessary requests to the backend
export const getUserSubscriptionLevel = cache(
  async (userId: string): Promise<SubscriptionLevel> => {
    const subscription = await prisma.userSubscription.findUnique({
      where: {
        userId,
      },
    });

    // Check if user has subscription
    if (!subscription || subscription.stripeCurrentPeriodEnd < new Date()) {
      return "free";
    }
    // stripe priceId determins subscription type
    if (
      subscription.stripePriceId === env.NEXT_PUBLIC_STRIPE_PRICE_ID_PRO_MONTHLY
    ) {
      return "pro";
    }

    if (
      subscription.stripePriceId ===
      env.NEXT_PUBLIC_STRIPE_PRICE_ID_PRO_PLUS_MONTHLY
    ) {
      return "pro_plus";
    }

    throw new Error("Invalid subscription");
  },
);
