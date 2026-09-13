function define(script)
{
    script.Name = "wander";
    script.Type = "AI";
    return 0;
}

function prepare(eState, manager)
{
    local aiState = eState.GetAIState();
    aiState.SetDespawnWhenLost(false);
    aiState.SetStatus(AIStatus_t.WANDERING, true);
    return 0;
}