function define(script)
{
    script.Name = "bool_iTimePointValue";
    script.Type = "EventCondition";
    return 0;
}

// Check if the supplied I-Time point value matches the value on the character
// - value1: I-Time ID
// - value2: point value
function check(source, cState, dState, zone, value1, value2, params)
{
    local character = cState != null ? cState.GetEntity() : null;
    local progress = character ? character.GetProgress().Get() : null;
    if(character == null || progress == null)
    {
        return -1;
    }

    return progress.GetITimePointsByKey(value1) == value2 ? 0 : -1;
}