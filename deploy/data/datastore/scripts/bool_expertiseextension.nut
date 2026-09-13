function define(script)
{
    script.Name = "bool_expertiseExtension";
    script.Type = "EventCondition";
    return 0;
}

// Check if the character's expertise extension is between the supplied values
// - value1: min value
// - value2: (optional) max value
function check(source, cState, dState, zone, value1, value2, params)
{
    local character = cState != null ? cState.GetEntity() : null;
    if(character == null)
    {
        return -1;
    }

    local val = character.GetExpertiseExtension();
    return val >= value1 && (val == 0 || val <= value2) ? 0 : -1;
}