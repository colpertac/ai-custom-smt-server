function define(script)
{
    script.Name = "bool_reunionPoints";
    script.Type = "EventCondition";
    return 0;
}

// Check if a character's associated world data is at or above a specified
// reunion point count
// - value1: Point count
// - value2: If 1, mitama reunion points are checked instead
function check(source, cState, dState, zone, value1, value2, params)
{
    return cState != null && cState.GetReunionPoints(value2 == 1) >= value1
        ? 0 : -1;
}