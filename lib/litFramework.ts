export type LitValue = 1 | 2 | 3 | 4 | 5;

export type LitCoordinate = {
  listening: LitValue;
  interest: LitValue;
  time: LitValue;
};

export type LitGuidance = LitCoordinate & {
  patternCode: string;
  patternLabel: string;
  mentorApproach: string;
  suitableNextStep: string;
  caution: string;
  evidenceNeeded: string;
};

function band(value: LitValue): "low" | "developing" | "high" {
  if (value <= 2) return "low";
  if (value === 3) return "developing";
  return "high";
}

export function guidanceForLit(coordinate: LitCoordinate): LitGuidance {
  const listeningBand = band(coordinate.listening);
  const interestBand = band(coordinate.interest);
  const timeBand = band(coordinate.time);
  const patternCode = `L${coordinate.listening}-I${coordinate.interest}-T${coordinate.time}`;

  let mentorApproach = "Maintain warm, natural contact and observe the next meaningful interactions.";
  let suitableNextStep = "Offer one small activity connected to his present interest.";
  let caution = "Do not infer a fixed personality from a temporary score.";

  if (listeningBand === "high" && interestBand === "high" && timeBand === "high") {
    mentorApproach = "Invest deeply through regular personal association and a progressive path.";
    suitableNextStep = "Agree on a clear book, chanting, association, and service commitment.";
    caution = "Do not rush leadership; verify steadiness, humility, and follow-through over time.";
  } else if (interestBand === "high" && timeBand === "low") {
    mentorApproach = "Protect the relationship and respect the genuine time constraint.";
    suitableNextStep = "Offer a ten-minute reading or hearing rhythm and one suitable meeting slot.";
    caution = "Avoid interpreting low availability as low sincerity or applying too much pressure.";
  } else if (timeBand === "high" && interestBand === "low") {
    mentorApproach = "Build taste through experience, friendship, hearing, and relevant service.";
    suitableNextStep = "Invite him to one enjoyable program or bounded service matching his interest.";
    caution = "Available time alone does not justify heavy philosophical or sādhana demands.";
  } else if (listeningBand === "low" && interestBand === "high") {
    mentorApproach = "Listen first and understand the source of resistance without argument.";
    suitableNextStep = "Ask one open question and let him choose a relevant topic to explore.";
    caution = "Do not confuse strong opinions or questioning with absence of spiritual interest.";
  } else if (listeningBand === "high" && interestBand === "low") {
    mentorApproach = "Keep guidance light and connect philosophy with his lived questions.";
    suitableNextStep = "Share one short, relevant passage and ask what he genuinely thinks.";
    caution = "Compliance must not be mistaken for inner conviction.";
  } else if (listeningBand === "low" && interestBand === "low" && timeBand === "low") {
    mentorApproach = "Keep a respectful, low-pressure connection without disproportionate pursuit.";
    suitableNextStep = "Offer occasional invitations and remain available if interest changes.";
    caution = "Do not label or dismiss him; circumstances and interest can change.";
  } else if (timeBand === "low") {
    mentorApproach = "Choose consistency over volume and learn the actual calendar constraint.";
    suitableNextStep = "Agree on the smallest credible weekly practice.";
    caution = "Avoid stacking several activities into the same constrained period.";
  } else if (interestBand === "developing") {
    mentorApproach = "Nourish curiosity with personally relevant hearing and conversation.";
    suitableNextStep = "Offer one focused topic, short book section, or RDUA discussion.";
    caution = "Do not demand commitments before interest becomes self-propelled.";
  }

  return {
    ...coordinate,
    patternCode,
    patternLabel: `${listeningBand} listening · ${interestBand} interest · ${timeBand} time`,
    mentorApproach,
    suitableNextStep,
    caution,
    evidenceNeeded:
      "Use mentor-approved interaction summaries, observable ABCDE activity, current college constraints, and confidence. Reassess after every three meaningful interactions.",
  };
}

export function buildAllLitCombinations(): LitGuidance[] {
  const combinations: LitGuidance[] = [];
  for (let listening = 1 as LitValue; listening <= 5; listening += 1) {
    for (let interest = 1 as LitValue; interest <= 5; interest += 1) {
      for (let time = 1 as LitValue; time <= 5; time += 1) {
        combinations.push(guidanceForLit({ listening, interest, time }));
      }
    }
  }
  return combinations;
}
