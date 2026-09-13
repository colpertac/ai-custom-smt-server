function define(script)
{
    script.Name = "bool_dungeonTrialActive";
    script.Type = "EventCondition";
    return 0;
}

// Check if the supplied time trial is active
// - value1: time trial ID
function check(source, cState, dState, zone, value1, value2, params)
{
    local character = cState != null ? cState.GetEntity() : null;
    local progress = character != null ? character.GetProgress().Get() : null;
    if(progress != null)
    {
        return progress.GetTimeTrialID() == value1 ? 0 : -1;
    }

    return -1;
}