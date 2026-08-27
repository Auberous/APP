export default function TeacherDashboard() {
  const handleCreateGame = () => {
    // Placeholder: game creation logic will be wired up later.
    console.log('Create Game clicked');
  };

  const handleViewResults = () => {
    // Placeholder: results view will be wired up later.
    console.log('View Results clicked');
  };

  return (
    <div>
      <h1>Teacher Dashboard</h1>
      <button onClick={handleCreateGame}>Create Game</button>
      <button onClick={handleViewResults}>View Results</button>
    </div>
  );
}
