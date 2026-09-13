function define(script)
{
    script.Name = "bool_notUsed";
    script.Type = "EventCondition";
    return 0;
}

// Always false. Useful for marking a message branch/choice as known but never implemented.
function check(source, cState, dState, zone, value1, value2, params)
{
    return -1;
}