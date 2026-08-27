import { useEffect } from 'react';

import HUD from '../components/HUD.jsx';
import AbilityButton from '../components/AbilityButton.jsx';
import QuestionModal from '../components/QuestionModal.jsx';

import { useGameState } from '../hooks/useGameState.js';
import { useQuestions } from '../hooks/useQuestions.js';

import { abilities } from '../game/abilities.js';

export default function Game1() {
  const { health, energy, activateAbility } = useGameState();
  const { currentQuestion, nextQuestion, checkAnswer, clearQuestion } = useQuestions();

  useEffect(() => {
    nextQuestion();
  }, [nextQuestion]);

  const handleAbilityClick = (ability) => {
    // Placeholder target — will be a real opponent once multiplayer lands.
    const target = { element: null };
    activateAbility(ability, target);
  };

  const handleAnswer = (answerIndex) => {
    checkAnswer(answerIndex);
    clearQuestion();
    nextQuestion();
  };

  return (
    <div>
      <h1>Game 1</h1>
      <HUD health={health} energy={energy} />

      <div className="ability-bar">
        {abilities.map((ability) => (
          <AbilityButton
            key={ability.name}
            name={ability.name}
            cost={ability.cost}
            onActivate={() => handleAbilityClick(ability)}
          />
        ))}
      </div>

      {currentQuestion && (
        <QuestionModal
          question={currentQuestion.question}
          answers={currentQuestion.answers}
          onAnswer={handleAnswer}
        />
      )}
    </div>
  );
}
