function define(script)
{
    script.Name = "bool_dungeonTrialID";
    script.Type = "EventCondition";
    return 0;
}

// Check if the time trial to be reported matches a time trial ID.
// - value1: A time trial ID.
function check(source, cState, dState, zone, value1, value2, params)
{
    local character = cState != null ? cState.GetEntity() : null;
    local progress = character != null ? character.GetProgress().Get() : null;
    if(progress != null)
    {
        local timeTrialID = progress.GetTimeTrialID();
        if(value1 == timeTrialID)
        {
            return 0;
        }
    }

    return -1;
}