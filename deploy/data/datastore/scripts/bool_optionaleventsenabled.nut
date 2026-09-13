function define(script)
{
    script.Name = "bool_optionalEventsEnabled";
    script.Type = "EventCondition";
    return 0;
}

// Check if global optional events flag is enabled for the zone
function check(source, cState, dState, zone, value1, value2, params)
{
    return zone != null && zone.GetFlagState(-1, 0, 0) == 1 ? 0 : -1;
}