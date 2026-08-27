import { useState, useCallback } from 'react';
import { loadQuestion } from '../game/questionLoader.js';

export function useQuestions() {
  const [currentQuestion, setCurrentQuestion] = useState(null);

  const nextQuestion = useCallback(() => {
    setCurrentQuestion(loadQuestion());
  }, []);

  const checkAnswer = useCallback(
    (answerIndex) => {
      if (!currentQuestion) return false;
      return answerIndex === currentQuestion.correctAnswer;
    },
    [currentQuestion]
  );

  const clearQuestion = useCallback(() => {
    setCurrentQuestion(null);
  }, []);

  return {
    currentQuestion,
    nextQuestion,
    checkAnswer,
    clearQuestion,
  };
}

export default useQuestions;
