function define(script)
{
    script.Name = "idle";
    script.Type = "AI";
    return 0;
}

function prepare(eState, manager)
{
    local aiState = eState.GetAIState();
    aiState.SetStatus(AIStatus_t.IDLE, true);
    return 0;
}