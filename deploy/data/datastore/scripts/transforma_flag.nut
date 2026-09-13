function define(script)
{
    script.Name = "transforma_flag";
    script.Type = "ActionTransform";
    return 0;
}

// Transform a supported action type by applying a flag value to the main
// numeric property or other specified property. Supported actions include:
//   -ActionGrantXP
//   -ActionPlayBGM
//   -ActionPlaySoundEffect
//   -ActionSetNPCState
//   -ActionSpecialDirection
//   -ActionStageEffect
//   -ActionUpdateFlag
//   -ActionUpdateLNC
//   -ActionUpdatePoints
//   -ActionZoneChange
//   -ActionZoneInstance
// - params[0]: Flag key
// - params[1]: ZONE (default), INSTANCE, CHARACTER or INSTANCE_CHARACTER for
//   flag type to set
function transform(source, cState, dState, zone, params)
{
    local worldCID = cState != null ? cState.GetWorldCID() : 0;
    local fType = params.len() >= 2 ? params[1] : "ZONE";
    if(params.len() < 1 || zone == null ||
        (fType != "ZONE" && fType != "INSTANCE" &&
        fType != "CHARACTER" && fType != "INSTANCE_CHARACTER"))
    {
        return -1;
    }
    else if(fType != "CHARACTER" && fType != "INSTANCE_CHARACTER")
    {
        worldCID = 0;
    }

    local flagSource = null;
    if(fType == "ZONE" || fType == "CHARACTER")
    {
        flagSource = zone;
    }
    else
    {
        flagSource = zone.GetZoneInstance();
    }

    if(flagSource == null)
    {
        return -1;
    }

    local value = flagSource.GetFlagState(params[0].tointeger(), 0, worldCID);
    switch(action.ActionType)
    {
    case Action_actionType_t.GRANT_XP:
        action.SetXP(value);
        break;
    case Action_actionType_t.PLAY_BGM:
        action.SetMusicID(value);
        break;
    case Action_actionType_t.PLAY_SOUND_EFFECT:
        action.SetSoundID(value);
        break;
    case Action_actionType_t.SET_NPC_STATE:
        if(params.len() > 2 && params[2].tolowercase() == "state")
        {
            action.SetState(value);
        }
        else
        {
            action.SetActorID(value);
        }
        break;
    case Action_actionType_t.SPECIAL_DIRECTION:
        action.SetDirection(value);
        break;
    case Action_actionType_t.STAGE_EFFECT:
        if(params.len() > 2 && params[2].tolowercase() == "message")
        {
            action.SetMessageID(value);
        }
        else
        {
            action.SetMessageValue(value);
        }
        break;
    case Action_actionType_t.UPDATE_FLAG:
        action.SetID(value);
        break;
    case Action_actionType_t.UPDATE_LNC:
        action.SetValue(value);
        break;
    case Action_actionType_t.UPDATE_POINTS:
        if(params.len() > 2 && params[2].tolowercase() == "modifier")
        {
            action.SetModifier(value);
        }
        else
        {
            action.SetValue(value);
        }
        break;
    case Action_actionType_t.ZONE_CHANGE:
        if(params.len() > 2 && params[2].tolowercase() == "dynamicmapid")
        {
            action.SetDynamicMapID(value);
        }
        else if(params.len() > 2 && params[2].tolowercase() == "spotid")
        {
            action.SetSpotID(value);
        }
        else
        {
            action.SetZoneID(value);
        }
        break;
    case Action_actionType_t.ZONE_INSTANCE:
        if(params.len() > 2 && params[2].tolowercase() == "variantid")
        {
            action.SetVariantID(value);
        }
        else if(params.len() > 2 && params[2].tolowercase() == "timerid")
        {
            action.SetTimerID(value);
        }
        else
        {
            action.SetInstanceID(value);
        }
        break;
    default: return -1;
    }

    return 0;
}