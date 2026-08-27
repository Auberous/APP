const PLACEHOLDER_QUESTIONS = [
  {
    question: 'What is 7 + 8?',
    answers: ['13', '15', '16', '14'],
    correctAnswer: 1,
  },
  {
    question: 'What is the capital of France?',
    answers: ['Berlin', 'Madrid', 'Paris', 'Rome'],
    correctAnswer: 2,
  },
  {
    question: 'Which planet is known as the Red Planet?',
    answers: ['Venus', 'Mars', 'Jupiter', 'Saturn'],
    correctAnswer: 1,
  },
  {
    question: 'What is 9 x 6?',
    answers: ['54', '56', '45', '52'],
    correctAnswer: 0,
  },
  {
    question: 'What gas do plants absorb from the atmosphere?',
    answers: ['Oxygen', 'Nitrogen', 'Carbon Dioxide', 'Hydrogen'],
    correctAnswer: 2,
  },
];

export function loadQuestion() {
  const index = Math.floor(Math.random() * PLACEHOLDER_QUESTIONS.length);
  return PLACEHOLDER_QUESTIONS[index];
}

export default loadQuestion;
