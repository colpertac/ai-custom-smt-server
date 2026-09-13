function define(script)
{
    script.Name = "bool_timeLimitActive";
    script.Type = "EventCondition";
    return 0;
}

// Check if the supplied instance timer ID is active
// - value1: timer ID (-1 for any)
function check(source, cState, dState, zone, value1, value2, params)
{
    local instance = zone != null ? zone.GetZoneInstance() : null;
    if(instance != null)
    {
        return (instance.GetTimerID() == value1 || (value1 == -1 && instance.GetTimerID())) ? 0 : -1;
    }

    return -1;
}