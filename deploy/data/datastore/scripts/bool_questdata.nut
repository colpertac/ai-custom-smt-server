function define(script)
{
    script.Name = "bool_questData";
    script.Type = "EventCondition";
    return 0;
}

// Check if the current character's supplied quest data matches or exceeds
// a minimum value
// - value1: quest ID
// - value2: quest custom data index
// - params[0]: optional minimum value, defaults to 1 if not specified
function check(source, cState, dState, zone, value1, value2, params)
{
    local character = cState != null ? cState.GetEntity() : null;
    local quest = character != null
        ? character.GetQuestsByKey(value1).Get() : null;
    if(quest != null)
    {
        local min = params.len() > 0 ? params[0].tointeger() : 1;
        return quest.GetCustomDataByIndex(value2) >= min ? 0 : -1;
    }

    return -1;
}