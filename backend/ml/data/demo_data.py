"""DEMO DATA GENERATOR for TruthLens AI.

    *** DEMO DATA - NOT PRODUCTION DATA ***

This module creates small, clearly-labelled *demonstration* datasets so the
application can run immediately without any external downloads. The generated
CSVs (backend/ml/data/demo_news.csv, demo_reviews.csv) contain template-based
synthetic text and only demonstrate the pipeline.

Replace them with a real dataset (see ml/data/README.md) for production use.

Run directly:  python -m backend.ml.data.demo_data
"""
from __future__ import annotations

import csv
import random
from pathlib import Path

from ... import config

RANDOM_SEED = 42

# --------------------------------------------------------------------------
# Slot banks
# --------------------------------------------------------------------------
ORGANIZATIONS = [
    "the Federal Transit Authority", "the National Weather Service", "the city council",
    "the Department of Health", "the European Space Agency", "the state legislature",
    "the Central Statistics Office", "the Food Safety Agency", "the Election Commission",
]
PEOPLE = [
    "Dr. Amara Chen", "Professor Daniel Reyes", "spokesperson Maria Keller",
    "Dr. James Okafor", "Mayor Sofia Alvarez", "analyst Peter Lindqvist",
    "researcher Hannah Suzuki", "commissioner David Adeyemi",
]
CITIES = [
    "Springfield", "Riverton", "Milford", "Oakdale", "Fairview", "Georgetown",
    "Lakewood", "Ashford", "Brookhaven", "Clearwater",
]
COMPANIES = [
    "Northwind Systems", "Brightline Energy", "Cobalt Devices", "Meridian Foods",
    "Halcyon Labs", "Vertex Motors", "Solstice Retail", "Pinebridge Insurance",
]
JOURNALS = [
    "the Journal of Applied Sciences", "the Public Health Review",
    "the Environmental Research Letters", "the Regional Policy Digest",
]
TOPICS = [
    "public transport expansion", "coastal restoration", "grid modernisation",
    "school infrastructure", "water treatment upgrades", "rural broadband",
    "wildfire prevention", "vaccination outreach", "housing policy",
]
DISEASES = ["the flu", "memory loss", "joint pain", "hair loss", "anxiety", "fatigue"]
GROUPS = ["the agency", "the corporation", "city officials", "the committee", "the board"]
CELEBS = ["the actor", "the singer", "the athlete", "the talk-show host"]
MONEY = ["$2.4 million", "$18 million", "$650,000", "$9.7 million", "$3.1 billion", "$540,000"]
PCTS = ["3", "7", "12", "18", "24", "5", "9"]
NUMS = ["120", "40", "260", "35", "85", "210", "16"]

# --------------------------------------------------------------------------
# REAL NEWS sentence pools (factual, neutral, sourced)
# --------------------------------------------------------------------------
REAL_NEWS_LEADS = [
    "{org} announced on Tuesday that it will allocate {money} towards {topic} over the next three years.",
    "Officials in {city} confirmed on Monday that the {topic} project remains on schedule and within budget.",
    "{company} reported quarterly revenue of {money}, an increase of {pct}% compared with the same period last year.",
    "A peer-reviewed study published in {journal} links moderate daily exercise with improved cardiovascular outcomes.",
    "{org} said preliminary data indicates air quality improved by {pct}% since new emission standards took effect in {city}.",
    "The regional transport authority approved a pilot programme to expand weekend services between {city} and the suburban corridor.",
]
REAL_NEWS_BODY = [
    "According to {person}, the decision follows an eighteen-month review that included public consultations and an independent audit.",
    "\"We reviewed the evidence carefully before reaching this conclusion,\" {person} told reporters at a briefing on Thursday.",
    "The agency said the figures were compiled from {n} monitoring stations and verified by an external auditor.",
    "Analysts noted that the results are broadly consistent with forecasts published by independent research groups.",
    "A spokesperson added that a detailed technical report will be released next month following peer review.",
    "Local residents who attended the hearing generally supported the plan, though several asked for additional safety measures.",
    "The company said it has notified regulators and is cooperating fully with the ongoing review.",
    "Researchers emphasised that the findings are preliminary and that larger trials are needed before firm conclusions.",
    "Shares closed {pct}% higher on the news, in line with the broader market index.",
    "No injuries were reported, and officials said normal operations are expected to resume by Friday.",
]
REAL_NEWS_CLOSE = [
    "Additional details are expected when the agency publishes its quarterly summary.",
    "The report is available on the organisation's website, and public comments are open for thirty days.",
    "Officials said they will provide updates as more verified information becomes available.",
]

# --------------------------------------------------------------------------
# FAKE NEWS sentence pools (sensational, caps, unverified claims)
# --------------------------------------------------------------------------
FAKE_NEWS_LEADS = [
    "SHOCKING: {group} caught RED-HANDED in a massive cover-up!!! Insiders finally reveal the truth they don't want you to know!",
    "You won't believe what {celeb} just did!!! This one photo is making everyone furious and the mainstream media refuses to cover it!",
    "BREAKING: Leaked secret documents PROVE everything!!! They have been hiding this from the public for YEARS!",
    "Miracle {product} CURES {disease} overnight!!! Doctors HATE this simple trick and hospitals are trying to BAN it!",
    "EXPOSED: The REAL reason {group} banned this video!!! They thought nobody would notice, but the evidence is going VIRAL!",
    "WARNING: Your {product} could be SPYING on you right now!!! Experts are BEGGING everyone to throw it away immediately!",
]
FAKE_NEWS_BODY = [
    "Insiders reveal that {group} has known about this for YEARS and deliberately kept it SECRET from ordinary people!",
    "This ONE weird trick changes EVERYTHING and they are desperately trying to silence anyone who shares it!!!",
    "Sources close to the investigation confirm the TRUTH — 100% GUARANTEED, nobody can deny it anymore!",
    "What happens next is absolutely INSANE. Watch before it gets deleted!!! Share this before it's TOO LATE!",
    "Countless families have DESTROYED their {product} after learning this. Why is nobody talking about this?!",
    "The so-called experts are FURIOUS because this information was never supposed to go public!!!",
    "A whistleblower (who cannot be named) claims the cover-up goes all the way to the TOP!",
    "Everyone is stunned — even skeptics admit they can't explain this. WAKE UP people!!!",
]
FAKE_NEWS_CLOSE = [
    "The mainstream media will NOT show you this. Spread the word before it disappears!!!",
    "Comment \"TRUTH\" below if you already knew about this!!!",
    "They deleted this three times already. Make sure everyone you know sees it TODAY!",
]
# --------------------------------------------------------------------------
# GENUINE REVIEW pools (specific, first-person, balanced)
# --------------------------------------------------------------------------
PRODUCTS = [
    "wireless earbuds", "blender", "robot vacuum", "memory foam pillow", "smartwatch",
    "coffee maker", "backpack", "air fryer", "desk lamp", "yoga mat", "phone case",
    "water bottle", "mechanical keyboard", "gaming mouse", "skincare serum", "protein powder",
]
BRANDS = ["SoundCore-X", "Nimbus", "Zenith Labs", "PureFlow", "VoltEdge", "AeroHome", "LumaGlow", "Ironclad"]
FEATURES = [
    "battery life", "build quality", "noise cancellation", "suction power", "firmness",
    "strap", "brewing temperature", "zippers", "airflow", "brightness", "grip",
    "texture", "key feel", "sensor accuracy", "absorption", "mixing",
]
MINOR_ISSUES = [
    "the manual is a bit sparse", "it is slightly heavier than expected",
    "the app took a while to pair", "one of the accessories felt flimsy",
    "the colour is a shade darker than pictured", "the charging cable is short",
    "setup instructions could be clearer", "the carry pouch is thin",
]
DURATIONS = ["two weeks", "a month", "three months", "six weeks", "about two months", "half a year"]

GENUINE_REVIEW_TEMPLATES = [
    "I bought the {product} about {duration} ago and have used it almost daily. Setup took a few minutes and the {feature} works as described. It is not perfect — {issue} — but for the price I am satisfied.",
    "Solid {product} for everyday use. The {feature} is exactly as advertised and shipping was quick. {issue}, but customer support replaced the part without hassle. Would buy from this brand again.",
    "After {duration} of heavy use I can say the {product} holds up well. The {feature} is genuinely good and it feels sturdy. Not the flashiest design, but it does the job.",
    "The {product} exceeded my expectations in some ways: the {feature} is excellent. On the downside, {issue}. Overall a reasonable purchase.",
    "Decent value overall. Delivery arrived two days early and packaging was fine. {feature} is better than my previous {product}. Took one star off because {issue}.",
    "Unfortunately the {product} stopped working after {duration}. The {feature} felt weaker over time and {issue}. Support offered a refund, which I accepted. I cannot really recommend this version.",
    "Mixed feelings about the {product}. I like the {feature}, but {issue}. If you need something basic it will do, otherwise consider other options.",
    "I have owned several {product}s over the years and this one is about average. The {feature} surprised me positively, though {issue}. Three stars seems fair.",
]
# --------------------------------------------------------------------------
# SUSPICIOUS REVIEW pools (hyperbolic, generic, promotional)
# --------------------------------------------------------------------------
SUSPICIOUS_REVIEW_TEMPLATES = [
    "BEST {product} EVER!!! Absolutely life changing, I cannot imagine living without it. Everyone needs this in their life right now. 10/10!!!",
    "This is the #1 {product} you will ever buy!!! Works perfectly, looks amazing, and the price is unbeatable. Highly recommend to everyone!!! A must have!",
    "WOW. Just WOW. {brand} really outdid themselves this time. Perfect in every way. I recommend it to all my friends and family. Five stars is not enough!!!",
    "Amazing amazing amazing!!! The best purchase I have ever made, hands down. Don't think twice, just buy this {product}. You will not regret it!!!",
    "Holy grail {product}!!! Changed my life completely. {brand} forever! Everybody at work bought one after seeing mine. Absolute perfection, buy it now!!!",
    "Perfect perfect perfect!!! Exactly what you need, does everything, better than every other {product} on the market. Buy it now and thank me later!!!",
    "I LOVE this {product}!!! It is the greatest thing ever invented, period. Everyone MUST own one. This company is the best, no competition even close!!!",
    "Unbelievable quality!!! This {product} is a game changer in every sense. Trust me, this is the one you want. Absolutely flawless. 11/10!!!",
]

# --------------------------------------------------------------------------
# Generation logic
# --------------------------------------------------------------------------

def _fill(template: str, rng: random.Random, **extra) -> str:
    slots = {
        "org": rng.choice(ORGANIZATIONS),
        "person": rng.choice(PEOPLE),
        "city": rng.choice(CITIES),
        "company": rng.choice(COMPANIES),
        "journal": rng.choice(JOURNALS),
        "topic": rng.choice(TOPICS),
        "disease": rng.choice(DISEASES),
        "group": rng.choice(GROUPS),
        "celeb": rng.choice(CELEBS),
        "money": rng.choice(MONEY),
        "pct": rng.choice(PCTS),
        "n": rng.choice(NUMS),
        "product": rng.choice(PRODUCTS),
        "brand": rng.choice(BRANDS),
        "feature": rng.choice(FEATURES),
        "issue": rng.choice(MINOR_ISSUES),
        "duration": rng.choice(DURATIONS),
    }
    slots.update(extra)
    return template.format(**slots)


def _compose(rng: random.Random, leads, bodies, closes, min_body: int, max_body: int) -> str:
    parts = [rng.choice(leads)]
    for _ in range(rng.randint(min_body, max_body)):
        parts.append(rng.choice(bodies))
    if rng.random() < 0.7:
        parts.append(rng.choice(closes))
    return " ".join(parts)


def build_news_dataset(n_per_class: int = 120) -> list[dict]:
    """Build a demo news dataset (label: real | misinformative)."""
    rng = random.Random(RANDOM_SEED)
    rows: list[dict] = []
    for _ in range(n_per_class):
        text = _compose(rng, REAL_NEWS_LEADS, REAL_NEWS_BODY, REAL_NEWS_CLOSE, 1, 2)
        rows.append({"label": "real", "text": text})
    for _ in range(n_per_class):
        text = _compose(rng, FAKE_NEWS_LEADS, FAKE_NEWS_BODY, FAKE_NEWS_CLOSE, 1, 2)
        rows.append({"label": "misinformative", "text": text})
    rng.shuffle(rows)
    return rows


def build_reviews_dataset(n_per_class: int = 160) -> list[dict]:
    """Build a demo review dataset (label: genuine | suspicious)."""
    rng = random.Random(RANDOM_SEED + 1)
    rows: list[dict] = []
    for _ in range(n_per_class):
        text = _fill(rng.choice(GENUINE_REVIEW_TEMPLATES), rng)
        rows.append({"label": "genuine", "text": text})
    for _ in range(n_per_class):
        text = _fill(rng.choice(SUSPICIOUS_REVIEW_TEMPLATES), rng)
        rows.append({"label": "suspicious", "text": text})
    rng.shuffle(rows)
    return rows


def save_demo_data(force: bool = False) -> tuple[Path, Path]:
    """Write demo CSVs (idempotent unless force=True). Returns their paths."""
    news_path = config.ML_DATA_DIR / "demo_news.csv"
    reviews_path = config.ML_DATA_DIR / "demo_reviews.csv"
    config.ML_DATA_DIR.mkdir(parents=True, exist_ok=True)

    if force or not news_path.exists():
        with news_path.open("w", newline="", encoding="utf-8") as fh:
            writer = csv.DictWriter(fh, fieldnames=["label", "text"])
            writer.writeheader()
            writer.writerows(build_news_dataset())
    if force or not reviews_path.exists():
        with reviews_path.open("w", newline="", encoding="utf-8") as fh:
            writer = csv.DictWriter(fh, fieldnames=["label", "text"])
            writer.writeheader()
            writer.writerows(build_reviews_dataset())
    return news_path, reviews_path


if __name__ == "__main__":  # pragma: no cover
    n_path, r_path = save_demo_data(force=True)
    print(f"DEMO data written:\n  {n_path}\n  {r_path}")
    print("NOTE: These are template-generated demonstration datasets, "
          "not real-world data.")



