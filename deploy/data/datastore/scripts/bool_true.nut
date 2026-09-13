function define(script)
{
    script.Name = "bool_true";
    script.Type = "EventCondition";
    return 0;
}

// Always true. Useful for skipInvalid enabled conditions.
function check(source, cState, dState, zone, value1, value2, params)
{
    return 0;
}