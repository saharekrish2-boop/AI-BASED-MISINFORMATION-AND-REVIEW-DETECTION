// Clearly-labelled DEMO examples. They are sent through the exact same real
// ML pipeline as user input - results are never pre-filled.
export const DEMO_NEWS_MISINFORMATIVE = {
  headline: "SHOCKING: Miracle vitamin CURES all diseases overnight!!!",
  content:
    "Doctors HATE this one weird trick! A leaked secret document PROVES that a miracle vitamin instantly cures every known disease overnight. Insiders reveal that big pharma has been hiding this cure for YEARS, and they are desperately trying to silence anyone who shares it. 100% GUARANTEED results! What happens next is absolutely INSANE - hospitals are trying to BAN this video. WAKE UP people, share this before it's TOO LATE!!!",
  source_url: "viral-health-truth.example.com/miracle-cure",
};

export const DEMO_NEWS_REAL = {
  headline: "City council approves $2.4 million budget for public transport expansion",
  content:
    "The city council announced on Tuesday that it will allocate $2.4 million towards public transport expansion over the next three years. According to spokesperson Maria Keller, the decision follows an eighteen-month review that included public consultations and an independent audit. \"We reviewed the evidence carefully before reaching this conclusion,\" Keller told reporters at a briefing on Thursday. The figures were compiled from 120 monitoring stations and verified by an external auditor, the agency said. Local residents who attended the hearing generally supported the plan, though several asked for additional safety measures. Additional details are expected when the agency publishes its quarterly summary.",
  source_url: "https://citynews.example.org/council-approves-transport-budget",
};

export const DEMO_REVIEW_GENUINE = {
  review_text:
    "I bought the wireless earbuds about two months ago and have used them almost daily. Setup took a few minutes and the battery life works as described - roughly six hours with the case. They are not perfect: the app took a while to pair and one of the ear tips felt flimsy. But for the price I am satisfied and would consider this brand again.",
  product_name: "SoundCore-X wireless earbuds",
  rating: 4,
  verified_purchase: true,
};

export const DEMO_REVIEW_SUSPICIOUS = {
  review_text:
    "BEST wireless earbuds EVER!!! Absolutely life changing, I cannot imagine living without it. Everyone needs this in their life right now. 10/10!!! Don't think twice, just buy it. Thank me later!!!",
  product_name: "SoundCore-X wireless earbuds",
  rating: 5,
  verified_purchase: false,
};
