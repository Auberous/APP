export default function QuestionModal({ question, answers, onAnswer }) {
  if (!question) return null;

  return (
    <div className="question-modal">
      <p>{question}</p>
      <ul>
        {answers.map((answer, index) => (
          <li key={index}>
            <button onClick={() => onAnswer(index)}>{answer}</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
